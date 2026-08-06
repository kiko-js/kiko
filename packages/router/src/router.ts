import { Signal } from "signal-polyfill"
import { createSignal } from "@kikojs/signal"
import { createHashHistory, createPathHistory, type HistoryAdapter } from "./history"
import { createMatcher } from "./matcher"
import type {
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
} from "./types"

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
  return result
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

export function createRouter(options: RouterOptions): Router {
  const mode: RouteMode = options.mode ?? "path"
  const base = options.base ?? ""
  const history: HistoryAdapter = mode === "hash" ? createHashHistory() : createPathHistory(base)

  /** 从 adapter 读取当前完整路径（路径 + query + # 片段），两种模式语义一致 */
  function currentPath(): string {
    const path = history.getPath()
    const hash = history.getHash()
    return path + (hash ? "#" + hash : "")
  }

  const routes = options.routes
  const matcher = createMatcher(routes)

  const beforeEachOpt = options.beforeEach
  const globalBefore: RouteGuard[] = Array.isArray(beforeEachOpt)
    ? beforeEachOpt
    : beforeEachOpt
      ? [beforeEachOpt]
      : []
  const globalAfter: ((to: RouteLocation, from: RouteLocation | null) => void)[] =
    options.afterEach ?? []

  const location = createSignal<RouteLocation>(resolveLocation(currentPath(), undefined, nextKey()))

  const matched = new Signal.Computed(() => {
    const loc = location.get()
    return matcher.matchAll(loc.path)
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

  function updateLocation(path: string, state: unknown, key: string): void {
    location.set(resolveLocation(path, state, key))
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

  async function commit(path: string, opts: NavigateOptions, redirectDepth = 0): Promise<void> {
    if (redirectDepth > MAX_REDIRECT_DEPTH) {
      throw new Error(`Too many redirects when navigating to ${path}`)
    }
    const state = opts.state
    const from = location.get()
    const to = resolveLocation(path, state, nextKey())
    const guardOutcome = await runGuards(to, from)
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
      )
      return
    }

    if (opts.replace) {
      history.replace(path, state)
    } else {
      history.push(path, state)
    }
    updateLocation(path, state, to.key)
    for (const hook of globalAfter) {
      hook(to, from)
    }
  }

  function navigate(to: string | number, opts: NavigateOptions = {}): void {
    if (typeof to === "number") {
      history.go(to)
      return
    }
    commit(to, opts).catch(err => {
      reportError(err)
    })
  }

  function push(to: string, state?: unknown): void {
    navigate(to, { state })
  }

  function replace(to: string, state?: unknown): void {
    navigate(to, { replace: true, state })
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

  function dispose(): void {
    unlisten()
    history.dispose()
  }

  // 监听浏览器前进/后退
  const unlisten = history.listen(() => {
    const from = location.get()
    const to = resolveLocation(currentPath(), undefined, nextKey())
    runGuards(to, from).then(outcome => {
      if (outcome === false) {
        // 被阻止时回退到上一个历史记录
        history.go(-1)
        return
      }
      if (outcome) {
        history.replace(outcome.path, outcome.state)
        updateLocation(outcome.path, outcome.state, nextKey())
        return
      }
      updateLocation(to.fullPath, undefined, to.key)
    })
  })

  const router: Router = {
    mode,
    location,
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
