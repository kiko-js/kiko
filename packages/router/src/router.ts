import { Signal } from "signal-polyfill"
import { createSignal, effect } from "@kikojs/signal"
import { createHashHistory, createPathHistory } from "./history"
import { createMatcher } from "./matcher"
import type {
  EntryScroll,
  HistoryAdapter,
  HistoryLocation,
  NavigateOptions,
  RedirectDescriptor,
  RouteComponentProps,
  RouteGuard,
  RouteLocation,
  RouteMode,
  RouteParams,
  RouteQuery,
  Router,
  RouterOptions,
  ScrollPosition,
} from "./types"
import { claimManualScrollRestoration, releaseManualScrollRestoration } from "./history"

let keyCounter = 0
function nextKey(): string {
  return `${Date.now().toString(36)}-${++keyCounter}`
}

function parseQuery(search: string): RouteQuery {
  const query: RouteQuery = {}
  const params = new URLSearchParams(search)
  for (const [key, value] of params) {
    const existing = query[key]
    if (existing === undefined) {
      query[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      query[key] = [existing, value]
    }
  }
  return query
}

type GuardOutcome = RedirectDescriptor | false | null

function normalizeGuardResult(result: boolean | string | RedirectDescriptor | void): GuardOutcome {
  if (result === false) return false
  if (result === undefined || result === null || result === true) return null
  if (typeof result === "string") return { path: result }
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as RedirectDescriptor).path === "string"
  ) {
    return result as RedirectDescriptor
  }
  throw new TypeError(
    "Invalid guard result: expected boolean, string, or RedirectDescriptor with a string path",
  )
}

function resolveLocation(path: string, state: unknown, key: string): RouteLocation {
  const hashIndex = path.indexOf("#")
  const hash = hashIndex >= 0 ? path.slice(hashIndex + 1) : ""
  const beforeHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path
  const queryIndex = beforeHash.indexOf("?")
  const query = queryIndex >= 0 ? parseQuery(beforeHash.slice(queryIndex + 1)) : {}
  const pathname = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash
  return {
    path: pathname || "/",
    hash,
    query,
    fullPath: path,
    state,
    key,
  }
}
/** 下一帧：浏览器走 rAF；无 rAF 的环境（测试/非 DOM）退化为微任务 */
function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve())
  else queueMicrotask(resolve)
  return promise
}

export function createRouter(options: RouterOptions): Router {
  const base = options.base ?? ""
  const ownsHistory = options.history === undefined
  const history: HistoryAdapter =
    options.history ?? (options.mode === "hash" ? createHashHistory() : createPathHistory(base))
  const mode: RouteMode = history.kind === "hash" ? "hash" : "path"

  // --- scrollBehavior 接管 -------------------------------------------------
  const scrollHandler = options.scrollBehavior
  let scrollOwned = false
  let detachScrollListener: (() => void) | undefined
  if (scrollHandler) {
    scrollOwned = claimManualScrollRestoration()
    // 持续把用户滚动写回当前条目，前进/后退时才有准确的 savedPosition
    if (typeof window !== "undefined") {
      let raf = 0
      const scheduleSave = (): void => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => {
            raf = 0
            history.setEntryScroll(currentScroll())
          })
        } else {
          queueMicrotask(() => {
            raf = 0
            history.setEntryScroll(currentScroll())
          })
        }
      }
      const onScroll = (): void => {
        if (raf) return
        raf = 1
        scheduleSave()
      }
      window.addEventListener("scroll", onScroll, { passive: true })
      detachScrollListener = () => {
        window.removeEventListener("scroll", onScroll)
        raf = 0
      }
    }
  }

  const currentScroll = (): EntryScroll => ({ top: window.scrollY ?? 0, left: window.scrollX ?? 0 })

  /** 离开当前条目前存下滚动位置（仅配置了 scrollBehavior 时） */
  function saveCurrentScroll(): void {
    if (!scrollHandler || typeof window === "undefined") return
    history.setEntryScroll(currentScroll())
  }

  /** 导航完成、DOM 渲染落定后应用滚动目标 */
  async function applyScroll(
    to: RouteLocation,
    from: RouteLocation | null,
    savedPosition: ScrollPosition | null,
    seq: number,
  ): Promise<void> {
    if (!scrollHandler || typeof window === "undefined") return
    let result: ScrollPosition | false | void
    try {
      result = await scrollHandler(to, from, savedPosition)
    } catch (err) {
      reportError(err)
      return
    }
    await nextFrame()
    if (disposed || seq !== navigationSeq || result === false || result === undefined) return
    if (result.el !== undefined) {
      const el = typeof result.el === "string" ? document.querySelector(result.el) : result.el
      el?.scrollIntoView({ behavior: result.behavior, block: "start", inline: "start" })
      return
    }
    window.scrollTo({
      top: result.top ?? 0,
      left: result.left ?? 0,
      behavior: result.behavior,
    })
  }

  /** 拼回完整路径（路径 + query + # 片段），三种 history 语义一致 */
  function joinRaw(raw: HistoryLocation): string {
    return raw.path + (raw.hash ? "#" + raw.hash : "")
  }

  const routes = options.routes ?? []
  const matcher = createMatcher(routes)

  const beforeEachOpt = options.beforeEach
  const globalBefore: RouteGuard[] = Array.isArray(beforeEachOpt)
    ? beforeEachOpt
    : beforeEachOpt
      ? [beforeEachOpt]
      : []
  const globalAfter: ((to: RouteLocation, from: RouteLocation | null) => void)[] =
    options.afterEach ?? []

  const initialRaw = history.location.get()
  const initialLocation = resolveLocation(joinRaw(initialRaw), initialRaw.state, nextKey())
  const location = createSignal<RouteLocation>(initialLocation)
  // 独立 path 信号：location.set 每次导航都会变，但 path 只在真正改变时通知，
  // 让 matched 及依赖它的订阅不被 query/hash 变化无效化。
  const path = createSignal(initialLocation.path)

  const matched = new Signal.Computed(() => {
    return matcher.matchAll(path.get())
  })

  const currentRoute = new Signal.Computed(() => {
    const list = matched.get()
    return list[list.length - 1]?.route ?? null
  })

  const params = new Signal.Computed(() => {
    const list = matched.get()
    const result: RouteParams = {}
    for (const item of list) {
      Object.assign(result, item.params)
    }
    return result
  })

  const query = new Signal.Computed(() => location.get().query)

  function updateLocation(pathname: string, state: unknown, key: string): void {
    const loc = resolveLocation(pathname, state, key)
    location.set(loc)
    // State.set 对相同值不通知：query/hash 变化时 path 信号保持静默
    if (loc.path !== path.get()) path.set(loc.path)
  }

  async function runGuards(to: RouteLocation, from: RouteLocation | null): Promise<GuardOutcome> {
    // 全局前置守卫
    for (const guard of globalBefore) {
      const result = normalizeGuardResult(await guard(to, from, router))
      if (result === false) return false
      if (result) return result
    }
    // 路由级进入守卫与重定向
    for (const item of matcher.matchAll(to.path)) {
      if (item.route.redirect) {
        const redirect = item.route.redirect
        const target = typeof redirect === "string" ? redirect : await redirect(to, from)
        return { path: target, replace: true }
      }
      if (item.route.beforeEnter) {
        const result = normalizeGuardResult(await item.route.beforeEnter(to, from, router))
        if (result === false) return false
        if (result) return result
      }
    }
    // 离开旧路由的守卫
    if (from) {
      for (const item of matcher.matchAll(from.path)) {
        if (item.route.beforeLeave) {
          const result = normalizeGuardResult(await item.route.beforeLeave(to, from, router))
          if (result === false) return false
          if (result) return result
        }
      }
    }
    return null
  }

  const MAX_REDIRECT_DEPTH = 10

  // Monotonic navigation id: async guard results from older navigations are
  // discarded once a newer navigation starts.
  let navigationSeq = 0

  async function commit(
    target: string,
    opts: NavigateOptions,
    redirectDepth = 0,
    seq = ++navigationSeq,
  ): Promise<void> {
    if (seq !== navigationSeq) return
    if (redirectDepth > MAX_REDIRECT_DEPTH) {
      throw new Error(`Too many redirects when navigating to ${target}`)
    }
    const state = opts.state
    const from = location.get()
    const to = resolveLocation(target, state, nextKey())
    // Avoid duplicate history entries for the same URL (unless explicitly
    // replacing). Query-only and hash-only changes still navigate because
    // fullPath differs.
    if (!opts.replace && to.fullPath === from.fullPath && to.state === from.state) {
      return
    }
    const guardOutcome = await runGuards(to, from)
    if (seq !== navigationSeq) return
    if (guardOutcome === false) {
      // 被守卫阻止，不执行导航
      return
    }
    if (guardOutcome) {
      // 重定向时递归处理，避免无限循环由调用方控制
      await commit(
        guardOutcome.path,
        { state: guardOutcome.state, replace: guardOutcome.replace ?? true },
        redirectDepth + 1,
        seq,
      )
      return
    }

    if (seq !== navigationSeq) return
    // Internal write: the history-location effect must not treat our own
    // push/replace as an external navigation.
    suppressExternal++
    saveCurrentScroll()
    if (opts.replace) {
      history.replace(target, state)
    } else {
      history.push(target, state)
    }
    updateLocation(target, state, to.key)
    for (const hook of globalAfter) {
      hook(to, from)
    }
    void applyScroll(to, from, null, seq)
  }

  function navigate(to: string | number, opts: NavigateOptions = {}): Promise<void> {
    if (typeof to === "number") {
      history.go(to)
      return Promise.resolve()
    }
    const seq = ++navigationSeq
    return commit(to, opts, 0, seq)
  }

  function push(to: string, state?: unknown): void {
    void navigate(to, { state }).catch(err => {
      reportError(err)
    })
  }

  function replace(to: string, state?: unknown): void {
    void navigate(to, { replace: true, state }).catch(err => {
      reportError(err)
    })
  }

  function back(): void {
    history.go(-1)
  }

  function forward(): void {
    history.go(1)
  }

  function go(delta: number): void {
    history.go(delta)
  }

  function beforeEach(guard: RouteGuard): () => void {
    globalBefore.push(guard)
    return () => {
      const idx = globalBefore.indexOf(guard)
      if (idx >= 0) globalBefore.splice(idx, 1)
    }
  }

  function afterEach(hook: (to: RouteLocation, from: RouteLocation | null) => void): () => void {
    globalAfter.push(hook)
    return () => {
      const idx = globalAfter.indexOf(hook)
      if (idx >= 0) globalAfter.splice(idx, 1)
    }
  }

  let disposed = false

  function dispose(): void {
    if (disposed) return
    disposed = true
    stopObserving()
    detachScrollListener?.()
    if (scrollOwned) releaseManualScrollRestoration()
    // 注入的 history 归调用方所有，router 只释放自己创建的
    if (ownsHistory) history.dispose()
  }

  /**
   * 外部变化统一入口：popstate / hashchange / go(delta) / 共享同一 history
   * 的其他 router 的写入，都通过 history.location 信号进入守卫管线。
   * 自身 push/replace 用 suppressExternal 跳过（守卫已在 commit 前跑过）。
   */
  let lastRaw = history.location.get()
  let suppressExternal = 0
  const stopObserving = effect(() => {
    const raw = history.location.get()
    if (raw === lastRaw || disposed) return
    lastRaw = raw
    if (suppressExternal > 0) {
      suppressExternal--
      return
    }
    const seq = ++navigationSeq
    const from = location.get()
    const to = resolveLocation(joinRaw(raw), raw.state, nextKey())
    // 目标条目离开时存储的滚动位置（manual 模式下浏览器不会自动恢复，
    // 此刻页面仍停在原位置，读取安全）
    const savedPosition = scrollHandler ? history.getEntryScroll() : undefined
    runGuards(to, from)
      .then(async outcome => {
        if (seq !== navigationSeq) return
        if (outcome === false) {
          // 被阻止时回退到上一个历史记录；补偿产生的变化同样跳过
          // （location 从未更新到被阻止的目标，无需再同步）。
          suppressExternal++
          history.go(-1)
          return
        }
        if (outcome) {
          // Redirects on popstate go through the full commit path so the
          // target re-runs guards and redirect chains stay depth-limited —
          // same semantics as programmatic navigation.
          await commit(outcome.path, { state: outcome.state, replace: true }, 0, seq)
          return
        }
        updateLocation(to.fullPath, to.state, to.key)
        for (const hook of globalAfter) {
          hook(to, from)
        }
        void applyScroll(to, from, savedPosition ?? null, seq)
      })
      .catch(err => {
        reportError(err)
      })
  })

  const router: Router = {
    mode,
    base,
    location,
    path,
    params,
    query,
    matched,
    currentRoute,
    navigate,
    push,
    replace,
    back,
    forward,
    go,
    dispose,
    beforeEach,
    afterEach,
  }

  // 初始加载同样走守卫：深链到 /admin + 鉴权守卫时先重定向，避免首屏渲染
  // 受保护内容。结果在微任务中落地（早于浏览器绘制，通常无闪烁）；若守卫
  // 返回前用户已发起导航，则放弃本次结果，避免覆盖更新的导航意图。
  const initialKey = location.get().key
  runGuards(location.get(), null)
    .then(outcome => {
      if (disposed || location.get().key !== initialKey) return
      if (outcome === false) return
      if (outcome) {
        history.replace(outcome.path, outcome.state)
        updateLocation(outcome.path, outcome.state, nextKey())
      }
      // 刷新/重开：恢复该条目上次离开时的滚动位置（scrollRestoration 已是 manual）
      void applyScroll(location.get(), null, history.getEntryScroll() ?? null, navigationSeq)
    })
    .catch(err => {
      reportError(err)
    })

  return router
}

/** 辅助函数：将匹配到的路由转换为组件 props */
export function getRouteProps(router: Router): RouteComponentProps {
  return {
    params: router.params.get(),
    query: router.query.get(),
    location: router.location.get(),
    router,
  }
}
