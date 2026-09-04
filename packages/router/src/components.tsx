/** @jsxImportSource @kikojs/dom */
import { computed, createWatcher, effect, untrack } from "@kikojs/signal"
import { getSSRRuntime, isHydrating, jsx } from "@kikojs/dom"
import {
  hydrateFragment,
  hydratePendingElement,
  hydratePendingGroup,
  hydrateValue,
  onHydrateCleanup,
} from "@kikojs/dom/hydrate"
import {
  cleanupWatchers,
  swapBranch,
  swapNodes,
  toNodes,
  trackCleanup,
} from "@kikojs/dom/jsx-runtime"
import {
  bindRouter,
  clearActiveRouter,
  currentFrame,
  currentRouter,
  popFrame,
  pushFrame,
  setActiveRouter,
  withFrame,
} from "./context"
import { getRouteProps } from "./router"
import type { KeepAlive, NavPath, RouteMatch, RouteRecord, Router } from "./types"

interface RouterProps {
  router: Router
  children?: unknown
}

export function Router(props: RouterProps): Node {
  const router = props.router
  if (getSSRRuntime()) {
    // SSR 字符串模式：无 DOM、无 effect。children 在 JSX 求值期就已被序列化
    // 成字符串，这里直接透传。服务端不压渲染帧——ssr-stream 的异步 chunkify
    // 会让并发请求的组件执行交错在同一微任务链里，同步帧栈会跨请求串扰；
    // 服务端解析走 withSSRRouter 的 AsyncLocalStorage 请求作用域（见 README「SSR」）。
    return (resolveChildren(props.children) ?? null) as Node
  }

  if (isHydrating()) {
    // 水合：SSR 输出就是 children 的序列化结果（Router 不产生包装标记），
    // 按标准协议采纳。children 组件在 hydrateFragment 的同步 walk 里执行，
    // 创建时刻从渲染帧捕获 router；信号兜底覆盖帧外的早创建组件。清理挂
    // 水合根：路由内容会被 Outlet 的分支交换移出初始位置，挂在子树节点上
    // 的 cleanup 会随交换丢失。
    setActiveRouter(router)
    onHydrateCleanup(() => {
      clearActiveRouter(router)
      router.dispose()
    })
    return withFrame({ router, depth: 0 }, () =>
      hydrateFragment(resolveChildren(props.children)),
    ) as unknown as Node
  }
  // 渲染帧 + activeRouter 信号：帧覆盖 children 的同步 walk（布局组件体内
  // 创建的组件精确捕获帧内 router）；作为 JSX children 早创建的组件由信号
  // 在挂载后补跑并一次性绑定。卸载出栈恢复上一个活动 router。
  setActiveRouter(router)
  const container = document.createDocumentFragment()
  pushFrame({ router, depth: 0 })
  try {
    const nodes = toNodes(resolveChildren(props.children) ?? [])
    for (const node of nodes) {
      container.appendChild(node)
    }
  } finally {
    popFrame()
  }
  // 清理挂到随子树移动的 marker 上，而不是 container fragment——render() /
  // swapNodes 会把 fragment 抽干，空 fragment 脱离 DOM 后 cleanupWatchers
  // 永远够不到它。放末尾：children 顺序不变（既有测试依赖 firstChild）。
  const marker = document.createComment("router")
  container.appendChild(marker)
  trackCleanup(marker, () => {
    clearActiveRouter(router)
    router.dispose()
  })

  return container
}

/**
 * children thunk 协议：kiko 的 jsx 急切执行组件，嵌套 Router 的 JSX children
 * 会先于内层 Router 体运行、被信号兜底绑到外层。函数 children 延迟到 Router
 * 帧内求值，子树精确绑定。与 @kikojs/dom 渲染函数的 thunk 惯例一致。
 */
function resolveChildren(children: unknown): unknown {
  return typeof children === "function" ? (children as () => unknown)() : children
}
interface LinkProps {
  to: NavPath
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
  // 一次性绑定槽位：创建时刻先试帧/ALS/信号；作为 Router 的 JSX children
  // 早创建时为 null，effect/点击时补绑——首个非空 router 永久生效。
  const slot = { router: currentRouter() }
  const resolve = (): Router | null => bindRouter(slot)
  if (getSSRRuntime()) {
    // SSR：只输出静态 <a href>。activeClass 高亮与点击导航依赖 DOM/effect，
    // 无法序列化，由水合后的客户端分支接管。onClick 由 ssrJsx 丢弃，无需取出。
    const { to, replace: _r, state: _s, activeClass: _ac, exact: _ex, children, ...rest } = props
    return jsx("a", {
      ...rest,
      href: resolveHref(resolve(), to),
      children,
    })
  }
  const { to, replace, state, activeClass, exact, children, onClick: userOnClick, ...rest } = props
  const userClickHandler = userOnClick as ((e: MouseEvent) => void) | undefined

  const onClick = (e: MouseEvent): void => {
    // Preserve user-supplied onClick: call it first and respect preventDefault.
    userClickHandler?.(e)
    if (e.defaultPrevented) return
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    const target = (e.currentTarget as HTMLAnchorElement).getAttribute("target")
    if (target && target !== "_self") return
    e.preventDefault()
    // 点击时惰性补绑（JSX children 先于 Router 体创建，槽位此刻可能仍空）
    const router = resolve()
    if (router) {
      void router.navigate(to, { replace, state }).catch(err => {
        reportError(err)
      })
    } else {
      window.location.href = to
    }
  }

  if (isHydrating()) {
    // 水合：SSR 已输出 <a href>。采纳现有元素并重放 props（onClick 委托等），
    // 采纳后补上响应式部分：href 按 mode/base 修正 + activeClass 高亮。
    // children 交由标准游标采纳，不能像客户端分支那样手动 append。
    return hydratePendingElement("a", { ...rest, onClick, children }, el => {
      const stop = attachLinkEffects(el as HTMLAnchorElement, to, activeClass, exact, resolve)
      trackCleanup(el, stop)
    })
  }

  const anchor = jsx("a", {
    ...rest,
    href: resolveHref(resolve(), to),
    onClick,
  })

  const stop = attachLinkEffects(anchor as HTMLAnchorElement, to, activeClass, exact, resolve)
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
/** href 修正 + activeClass 高亮的响应式绑定（客户端与水合共用）。
 *  resolve 为一次性绑定读取：effect 首个非空 router 永久生效，此后只订阅
 *  path 变化，不会被其后挂载的其他 Router 串扰。 */
function attachLinkEffects(
  anchorEl: HTMLAnchorElement,
  to: string,
  activeClass: string | undefined,
  exact: boolean | undefined,
  resolve: () => Router | null,
): () => void {
  const el = anchorEl as HTMLElement
  return effect(() => {
    const router = resolve()
    anchorEl.setAttribute("href", resolveHref(router, to))
    if (!activeClass || !router) return
    const match = isActivePath(router.path.get(), to, exact ?? false)
    // classList tokens must not contain whitespace — split once, use for both
    // add and remove ("nav active" would throw in classList.add as-is).
    const classes = activeClass.split(" ").filter(c => c !== "")
    if (match) {
      for (const c of classes) el.classList.add(c)
    } else {
      for (const c of classes) el.classList.remove(c)
    }
  })
}

interface OutletProps {
  router?: Router
  /** 离屏保留开关/配置；显式 false 可关闭路由表里的 keepAlive */
  keepAlive?: KeepAlive
  /**
   * 自定义实例键。默认只按路由身份（route.path）缓存——params/query 都是
   * 组件内部通过 hook 响应式消费的数据，变化不重建组件。若想按参数/URL
   * 区分实例（如不同 id 各自独立表单状态），返回一个稳定值即可。
   */
  keyBy?: (entry: RouteMatch, router: Router) => unknown
}

const DEFAULT_KEEP_ALIVE_MAX = 10

interface ResolvedKeepAlive {
  max: number
}

/**
 * 该层级是否启用离屏保留：
 * - Outlet 的 keepAlive prop 优先（显式 false 关闭）
 * - 否则看当前层级及后代路由的 route.keepAlive——后代要保留，祖先必须
 *   连带保留，否则整个分支被父级清理后子级缓存毫无意义。
 */
function resolveKeepAlive(
  matched: RouteMatch[],
  depth: number,
  prop: KeepAlive | undefined,
): ResolvedKeepAlive | null {
  if (prop === false) return null
  if (prop === true) return { max: DEFAULT_KEEP_ALIVE_MAX }
  if (prop !== undefined && prop !== null && typeof prop === "object") {
    const max = prop.max
    return max !== undefined && max > 0 ? { max } : null
  }
  for (let i = depth; i < matched.length; i++) {
    const ka = matched[i]?.route.keepAlive
    if (ka === true) return { max: DEFAULT_KEEP_ALIVE_MAX }
    if (ka !== undefined && ka !== null && typeof ka === "object") {
      const max = ka.max
      return max !== undefined && max > 0 ? { max } : null
    }
  }
  return null
}

interface OutletSnapshot {
  router: Router | null
  component: NonNullable<RouteRecord["component"]> | null
  key: string | null
  keep: ResolvedKeepAlive | null
}

export function Outlet(props: OutletProps): Node {
  if (getSSRRuntime()) {
    // SSR 字符串模式：无 DOM/watcher/effect，静态输出当前深度匹配的路由
    // 组件。router 取 props.router ?? 渲染帧 ?? 请求作用域（ALS）；都拿不到
    // 时输出空（与客户端"无 router 渲染空"语义一致）。
    const staticRouter = props.router ?? currentRouter()
    const depth = currentFrame()?.depth ?? 0
    // SSR 边界：无 router / 无匹配组件时输出空（客户端同语义）；类型层面
    // Node 在 SSR 下实际为序列化字符串，空即空串。
    if (!staticRouter) return null as unknown as Node
    const entry = staticRouter.matched.get()[depth]
    const component = entry?.route?.component
    if (!component) return null as unknown as Node
    pushFrame({ router: staticRouter, depth: depth + 1 })
    try {
      return component(getRouteProps(staticRouter)) as unknown as Node
    } finally {
      popFrame()
    }
  }
  // 一次性绑定槽位：嵌套 Outlet 创建于父帧内精确捕获；作为 Router 的 JSX
  // children 早创建的根 Outlet 为 null，快照响应式补绑（首个非空生效）。
  const slot = { router: props.router ?? currentRouter() }
  const resolve = (): Router | null => bindRouter(slot)
  const depth = currentFrame()?.depth ?? 0

  if (isHydrating()) {
    // 水合：SSR 输出就是匹配路由组件的渲染结果（Outlet 不产生包装标记），
    // 无现成锚点。Router 的水合帧覆盖本 walk：创建时刻已捕获 router，
    return hydratePendingGroup(() => {
      const router = resolve()
      if (!router) return []
      const entry = router.matched.get()[depth]
      const component = entry?.route?.component
      if (!entry || !component) return []
      let adopted: Node[]
      pushFrame({ router, depth: depth + 1 })
      try {
        adopted = hydrateValue(component(getRouteProps(router)))
      } finally {
        popFrame()
      }
      if (adopted.length === 0) return []
      const marker = document.createComment("outlet")
      const parent = adopted[0]!.parentNode
      if (parent) parent.insertBefore(marker, adopted[0]!)
      attachOutletLoop(marker, props, resolve, depth, adopted)
      return adopted
    })
  }

  const marker = document.createComment("outlet")
  const parent = document.createDocumentFragment()
  parent.appendChild(marker)
  attachOutletLoop(marker, props, resolve, depth, null)
  return parent
}

/**
 * Outlet 的响应式交换循环（客户端与水合共用）。`preset` 非空表示水合：
 * 初始分支已在 DOM（刚采纳），只补登记 + 挂 watcher，不重渲染组件。
 */
function attachOutletLoop(
  marker: Comment,
  props: OutletProps,
  resolve: () => Router | null,
  depth: number,
  preset: Node[] | null,
): void {
  let currentNodes: Node[] = []
  let currentKey: string | null = null
  let currentKeep: ResolvedKeepAlive | null = null
  let disposed = false

  // 离屏子树缓存：key -> 已渲染节点。条目都保留 watcher/cleanup，
  // 换入换出只是 detach/reinsert，不重跑 component、不丢状态。
  const cache = new Map<string, Node[]>()

  // 快照只依赖一次性绑定的 router + matched（path 信号驱动）：绑定为 null
  // 时读取 currentRouter（帧/ALS/信号）建立依赖，Router 挂载后补绑重算；
  // query/hash 变化不会让它重算，自然也不会触发渲染函数。
  const snapshot = computed<OutletSnapshot>(() => {
    const router = resolve()
    if (!router) return { router: null, component: null, key: null, keep: null }
    const matched = router.matched.get()
    const entry = matched[depth]
    const route = entry?.route
    const component = route?.component ?? null
    const keep = resolveKeepAlive(matched, depth, props.keepAlive)
    if (!entry || !component) return { router, component: null, key: null, keep }
    // 稳定键：默认只有路由身份（route.path）。params/query 都是“数据”，
    // query/hash/参数变化都不重建组件——页面通过 useParams/useQuery 等
    // hook 响应式消费；需要按参数区分实例时用 Outlet 的 keyBy。
    const key = props.keyBy ? String(props.keyBy(entry, router)) : entry.route.path
    return { router, component, key, keep }
  })

  const evict = (max: number): void => {
    while (cache.size > max) {
      const oldestKey = cache.keys().next().value
      if (oldestKey === undefined) break
      const nodes = cache.get(oldestKey)
      cache.delete(oldestKey)
      if (nodes && nodes !== currentNodes) {
        for (const n of nodes) if (n.parentNode === null) cleanupWatchers(n)
      }
    }
  }

  // 渲染在 watcher 回调（微任务）里执行，而不是包在 effect 的 cleanup scope
  // 中——route component 内部创建的 effect 才能活过导航，由离屏缓存接管，
  // 与 kiko「组件函数只跑一次、状态挂在节点上」的核心模型一致。
  const render = (): void => {
    const snap = snapshot.get()

    // 路由身份变化：把当前分支换出去。保留模式只 detach、不清理；
    // 非保留模式完整清理（旧行为，状态随导航丢弃）。
    if (currentNodes.length > 0 && currentKey !== snap.key) {
      if (currentKeep && currentKey !== null) {
        cache.set(currentKey, currentNodes)
        evict(currentKeep.max)
        currentNodes = swapBranch(marker, currentNodes, [], true)
      } else {
        currentNodes = swapNodes(marker, currentNodes, [])
      }
      currentKey = null
      currentKeep = null
    }

    const router = snap.router
    if (!router || !snap.component || snap.key === null) return

    // 同 key 已在屏幕上：什么都不用做（query/hash 导航也走不到这里，
    // 但保留这一道防线避免无谓的 detach/reattach 丢焦点）。
    if (currentNodes.length > 0 && currentKey === snap.key) return

    const cached = cache.get(snap.key)
    if (cached && cached.length > 0) {
      cache.delete(snap.key)
      cache.set(snap.key, cached) // 移到 MRU
      currentNodes = swapBranch(marker, currentNodes, cached, false)
      currentKey = snap.key
      currentKeep = snap.keep
      return
    }

    const next: Node[] = []
    try {
      // untrack：props 快照一次性读取，不让 Outlet 订阅 params/query/location
      const routeProps = untrack(() => getRouteProps(router))
      pushFrame({ router, depth: depth + 1 })
      try {
        const node = snap.component(routeProps)
        next.push(node)
      } finally {
        popFrame()
      }
    } catch (err) {
      reportError(err)
      next.push(document.createTextNode(""))
    }
    currentNodes = swapNodes(marker, currentNodes, next)
    currentKey = snap.key
    currentKeep = snap.keep
    if (snap.keep) {
      cache.set(snap.key, next)
      evict(snap.keep.max)
    }
  }

  const watcher = createWatcher(() => {
    queueMicrotask(() => {
      // cleanup 后到期的微任务不能复活 watcher（见 trackCleanup 处 disposed）
      if (disposed) return
      try {
        render()
      } catch (err) {
        reportError(err)
      } finally {
        if (!disposed) watcher.watch(snapshot)
      }
    })
  })

  if (preset) {
    // 水合：初始分支已在 DOM。登记快照态，首个响应式周期靠
    // "同 key 已在屏幕上"防线跳过重渲染。
    const snap = snapshot.get()
    currentNodes = preset
    currentKey = snap.key
    currentKeep = snap.keep
    if (snap.keep && snap.key) {
      cache.set(snap.key, preset)
      evict(snap.keep.max)
    }
  } else {
    render()
  }
  watcher.watch(snapshot)

  // 注意挂到 marker 而不是 parent：parent 是 DocumentFragment，被 Router /
  // render 追加后会变空并从 DOM 树消失，挂在它上面的 cleanup 会随树丢失
  // （旧实现泄漏）。marker 会随子树一起移动，cleanupWatchers 总能到达它。
  trackCleanup(marker, () => {
    disposed = true
    // 清理当前可见分支 + 离屏缓存分支；seen 防同一批节点重复清理
    const seen = new Set<Node>()
    const clean = (nodes: Node[]): void => {
      for (const n of nodes) {
        if (seen.has(n)) continue
        seen.add(n)
        cleanupWatchers(n)
      }
    }
    clean(currentNodes)
    for (const nodes of cache.values()) clean(nodes)
    watcher.unwatch(snapshot)
  })
}

interface NavigateProps {
  to: NavPath
  replace?: boolean
  state?: unknown
}

export function Navigate(props: NavigateProps): Node {
  if (getSSRRuntime()) {
    // SSR：导航是客户端副作用，服务端渲染时不输出、不导航（空串）。
    return null as unknown as Node
  }
  // 一次性绑定：Router 渲染帧内的 Navigate 创建即捕获；作为 JSX children
  // 早创建时为 null，effect 读帧/ALS/信号在 Router 挂载后补绑并导航一次。
  const slot = { router: currentRouter() }
  const resolve = (): Router | null => bindRouter(slot)
  if (isHydrating()) {
    // 水合：SSR 输出为空（无标记、无节点），游标不消费。没有 DOM 锚点
    // 可挂，effect 的清理挂水合根。
    let done = false
    const stop = effect(() => {
      if (done) return
      const router = resolve()
      if (!router) return
      done = true
      void router
        .navigate(props.to, { replace: props.replace ?? true, state: props.state })
        .catch(err => {
          reportError(err)
        })
    })
    onHydrateCleanup(stop)
    return hydratePendingGroup(() => [])
  }
  const marker = document.createComment("navigate")
  let done = false
  const dispose = effect(() => {
    if (done) return
    const router = resolve()
    if (!router) return
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
