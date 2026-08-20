/** @jsxImportSource @kikojs/dom */
import { effect } from "@kikojs/signal"
import { jsx } from "@kikojs/dom"
import { cleanupWatchers, swapNodes, toNodes, trackCleanup } from "@kikojs/dom/jsx-runtime"
import { clearActiveRouter, getActiveRouter, setActiveRouter } from "./context"
import { getRouteProps } from "./router"
import type { RouteComponentProps, RouteGuard, RouteLocation, Router } from "./types"

interface RouterProps {
  router: Router
  children?: unknown
}

export function Router(props: RouterProps): Node {
  const router = props.router
  // JSX children 先于本组件体求值，因此这里设置的是"信号"——children 中的
  // Outlet / Link / Navigate 创建的 effect 依赖它，挂载后自动补跑。
  setActiveRouter(router)

  const container = document.createDocumentFragment()
  if (props.children) {
    const nodes = toNodes(props.children)
    for (const node of nodes) {
      container.appendChild(node)
    }
  }

  trackCleanup(container, () => {
    // 从栈中移除自己，恢复上一个活动 router（多 Router 共存时不误清他人）
    clearActiveRouter(router)
    router.dispose()
  })

  return container
}

export interface RouteProps {
  path: string
  component?: (props: RouteComponentProps) => Node
  children?: unknown
  meta?: Record<string, unknown>
  beforeEnter?: RouteGuard
  beforeLeave?: RouteGuard
  redirect?: (to: RouteLocation, from: RouteLocation | null) => string | Promise<string>
  redirectTo?: string
  /** 是否精确匹配（默认 false：/users 也会匹配 /users/:id 前缀） */
  exact?: boolean
}

export function Route(props: RouteProps): Node {
  // 声明式子路由：读取当前活动的 router；当当前路径命中 props.path 时渲染
  // component（传入 route props），否则渲染空片段。这是对 routes 数组的
  // 互补声明式 API——适合与 JSX 树就地组合的小型路由。
  const marker = document.createComment("route")
  const frag = document.createDocumentFragment()
  frag.appendChild(marker)

  // 缓存上一次渲染的节点，便于 swapNodes 复用/清理。
  let lastNodes: Node[] = []

  const dispose = effect(() => {
    const active = getActiveRouter()
    if (!active) {
      // 作为 Router 的 JSX children 时创建阶段拿不到 router；等 Router 挂载
      // 后 activeRouter 信号变化触发本 effect 补跑。
      swapNodes(marker, lastNodes, [])
      lastNodes = []
      return
    }
    const loc = active.location.get()
    const matched = isActivePath(loc.path, props.path, props.exact ?? false)
    if (matched && props.component) {
      const next = props.component(getRouteProps(active))
      swapNodes(marker, lastNodes, [next])
      lastNodes = [next]
    } else {
      swapNodes(marker, lastNodes, [])
      lastNodes = []
    }
  })

  trackCleanup(frag, () => {
    cleanupWatchers(frag)
    dispose()
  })

  return frag
}

interface LinkProps {
  to: string
  replace?: boolean
  state?: unknown
  children?: unknown
  class?: string
  activeClass?: string
  exact?: boolean
  [key: string]: unknown
}

/** 分段感知的路径匹配：/user 不匹配 /users；/ 匹配所有路径（非 exact 时）。 */
export function isActivePath(path: string, to: string, exact: boolean): boolean {
  if (exact) return path === to
  if (to === "/") return path.startsWith("/")
  const prefix = to.endsWith("/") ? to : to + "/"
  return path === to || path.startsWith(prefix)
}

/** Build an href that works with the active router mode/base for middle-click,
 *  new-tab, and copy-link. Absolute URLs pass through unchanged. */
function resolveHref(router: Router | null, to: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(to) || to.startsWith("//")) return to
  if (!router) return to
  const normalized = to.startsWith("/") ? to : "/" + to
  if (router.mode === "hash") return "#" + normalized
  return router.base + normalized
}

export function Link(props: LinkProps): Node {
  const { to, replace, state, activeClass, exact, children, onClick: userOnClick, ...rest } = props

  const userClickHandler = userOnClick as ((e: MouseEvent) => void) | undefined
  const anchor = jsx("a", {
    ...rest,
    href: resolveHref(getActiveRouter(), to),
    onClick: (e: MouseEvent) => {
      // Preserve user-supplied onClick: call it first and respect preventDefault.
      userClickHandler?.(e)
      if (e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
      const target = (e.currentTarget as HTMLAnchorElement).getAttribute("target")
      if (target && target !== "_self") return
      e.preventDefault()
      // JSX children 先于父组件求值：Link 创建时 Router 尚未 setActiveRouter，
      // 因此点击时惰性解析——模块槽位在 Router 挂载后保持有效。
      const router = getActiveRouter()
      if (router) {
        void router.navigate(to, { replace, state }).catch(err => {
          reportError(err)
        })
      } else {
        window.location.href = to
      }
    },
  })

  const anchorEl = anchor as HTMLAnchorElement
  const el = anchorEl as HTMLElement
  const stop = effect(() => {
    // Update href when the router appears (JSX children evaluate before Router
    // mounts) so middle-click/new-tab use the correct mode/base.
    const router = getActiveRouter()
    anchorEl.setAttribute("href", resolveHref(router, to))
    if (!activeClass || !router) return
    const loc = router.location.get()
    const match = isActivePath(loc.path, to, exact ?? false)
    if (match) {
      el.classList.add(activeClass)
    } else {
      const classes = activeClass.split(" ")
      for (const c of classes) {
        if (c) el.classList.remove(c)
      }
    }
  })
  // effect 的 watcher 不挂在 anchor 上，不 track 会在 Router 卸载后泄漏
  trackCleanup(anchor, stop)

  if (children) {
    const nodes = toNodes(children)
    for (const node of nodes) {
      anchor.appendChild(node)
    }
  }

  return anchor
}

interface OutletProps {
  router?: Router
}

/**
 * 嵌套布局渲染帧：渲染 route component 期间压栈，嵌套 Outlet 创建时
 * 从中读取自己的层级（根 Outlet 无帧，depth 为 0）。
 * 栈仅在同步渲染期间存在——与 @kikojs/dom 的 context 栈同构。
 */
interface OutletFrame {
  router: Router
  depth: number
}

const frameStack: OutletFrame[] = []

export function Outlet(props: OutletProps): Node {
  // 创建时捕获层级：JSX 求值发生在父组件同步渲染期间（帧已压栈），
  // 响应式重渲染时不再有帧，depth 必须在创建时定格。
  const creationFrame = frameStack.length > 0 ? frameStack[frameStack.length - 1] : undefined
  const staticRouter = props.router ?? creationFrame?.router ?? null
  const depth = creationFrame ? creationFrame.depth : 0

  const marker = document.createComment("outlet")
  const parent = document.createDocumentFragment()
  parent.appendChild(marker)

  let currentNodes: Node[] = []

  // 子树记忆化缓存：按 (route 标识, 匹配到的 pathname) 缓存已渲染的节点。
  // query/hash 变化只改 query 信号，pathname 不变 → 复用旧节点（其内部的
  // useParams/useQuery/useLocation 信号仍然响应），无需重跑 component。
  // 仅在 route 身份或 pathname 改变时才重建子树并清理旧节点的 watchers。
  let cachedKey: string | null = null
  let cachedNodes: Node[] = []

  const dispose = effect(() => {
    // 根 Outlet 创建时 Router 尚未挂载（children 先求值）：静态 router 为空时
    // 响应式读取 activeRouter，Router 挂载后本 effect 自动补跑渲染。
    const router = staticRouter ?? getActiveRouter()
    if (!router) {
      currentNodes = swapNodes(marker, currentNodes, [])
      return
    }
    const matched = router.matched.get()
    const entry = matched[depth]
    const route = entry?.route
    const component = route?.component
    if (!component) {
      currentNodes = swapNodes(marker, currentNodes, [])
      return
    }
    // pathname = location.path，忽略 query/hash。route 身份用 path 作为
    // 稳定键（同一 path 模式编译后 route 对象引用恒定）。
    const pathname = router.location.get().path
    const key = `${route.path}${pathname}`
    // key 未变：复用缓存节点（不重跑 component），保持其内部信号响应式。
    if (cachedKey === key && cachedNodes.length > 0) {
      currentNodes = swapNodes(marker, currentNodes, cachedNodes)
      return
    }
    // key 变化（或首次）：移除当前 DOM 中的旧节点（swapNodes 会清理其
    // watchers），重建新子树。
    const next: Node[] = []
    try {
      // 读取 getRouteProps 内的 location/params/query 建立完整依赖：
      // query-only 导航（path 不变）也会重渲染。
      const props = getRouteProps(router)
      frameStack.push({ router, depth: depth + 1 })
      try {
        const node = component(props)
        next.push(node)
      } finally {
        frameStack.pop()
      }
    } catch (err) {
      reportError(err)
      next.push(document.createTextNode(""))
    }
    cachedKey = key
    cachedNodes = next
    currentNodes = swapNodes(marker, currentNodes, next)
  })

  trackCleanup(parent, () => {
    cleanupWatchers(parent)
    dispose()
  })

  return parent
}

interface NavigateProps {
  to: string
  replace?: boolean
  state?: unknown
}

export function Navigate(props: NavigateProps): Node {
  // 与 Outlet 同理：作为 Router 的 JSX children 时创建阶段拿不到 router，
  // 导航延迟到 effect——Router 挂载后 activeRouter 信号变化触发补跑。
  const marker = document.createComment("navigate")
  let done = false

  const dispose = effect(() => {
    const router = getActiveRouter()
    if (!router || done) return
    done = true
    void router
      .navigate(props.to, { replace: props.replace ?? true, state: props.state })
      .catch(err => {
        reportError(err)
      })
  })

  trackCleanup(marker, dispose)

  return marker
}
