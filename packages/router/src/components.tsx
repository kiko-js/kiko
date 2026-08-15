/** @jsxImportSource @kikojs/dom */
import { effect } from "@kikojs/signal"
import { jsx } from "@kikojs/dom"
import { cleanupWatchers, swapNodes, toNodes, trackCleanup } from "@kikojs/dom/jsx-runtime"
import { getActiveRouter, setActiveRouter } from "./context"
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
    // 只清除"自己"的占位，避免误清另一个 Router 的活动状态
    if (getActiveRouter() === router) setActiveRouter(null)
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
}

export function Route(_props: RouteProps): Node {
  // Route 组件只在声明式路由表配置中通过 routes 数组使用，组件本身不渲染 DOM。
  return document.createComment("route")
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
function isActivePath(path: string, to: string, exact: boolean): boolean {
  if (exact) return path === to
  if (to === "/") return path.startsWith("/")
  const prefix = to.endsWith("/") ? to : to + "/"
  return path === to || path.startsWith(prefix)
}

export function Link(props: LinkProps): Node {
  const { to, replace, state, activeClass, exact, children, ...rest } = props

  const anchor = jsx("a", {
    ...rest,
    href: to,
    onClick: (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
      const target = (e.currentTarget as HTMLAnchorElement).getAttribute("target")
      if (target && target !== "_self") return
      e.preventDefault()
      // JSX children 先于父组件求值：Link 创建时 Router 尚未 setActiveRouter，
      // 因此点击时惰性解析——模块槽位在 Router 挂载后保持有效。
      const router = getActiveRouter()
      if (router) {
        router.navigate(to, { replace, state })
      } else {
        window.location.href = to
      }
    },
  })

  if (activeClass) {
    const el = anchor as HTMLElement
    const stop = effect(() => {
      // 读取 activeRouter 信号建立依赖：Link 作为 JSX children 先于 Router
      // 求值时首跑拿不到 router，Router 挂载后本 effect 自动补跑。
      const router = getActiveRouter()
      if (!router) return
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
  }

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
    const component = entry?.route.component
    const next: Node[] = []
    if (component) {
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
    }
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
    router.navigate(props.to, { replace: props.replace ?? true, state: props.state })
  })

  trackCleanup(marker, dispose)

  return marker
}
