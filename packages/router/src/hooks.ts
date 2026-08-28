import { getActiveRouter, useRouter as useRouterContext } from "./context"
import { isActivePath } from "./components"
import { createMatcher } from "./matcher"
import { navigateFrom } from "./utils"
import { Signal } from "signal-polyfill"
import type { NavPath, RouteLocation, RouteParams, RouteQuery, Router } from "./types"

/** A live snapshot: call it like an accessor, read `.get()`, or access fields directly. */
export type ReactiveSnapshot<T> = T & {
  (): T
  get(): T
}

function toReactive<T>(signal: Signal.State<T> | Signal.Computed<T>): ReactiveSnapshot<T> {
  const accessor = (() => signal.get()) as unknown as ReactiveSnapshot<T>
  return new Proxy(accessor, {
    apply: () => signal.get(),
    get: (_target, prop) => {
      if (prop === "get") return () => signal.get()
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined
      return (signal.get() as Record<PropertyKey, unknown>)[prop]
    },
    has: (_target, prop) => prop === "get" || prop in (signal.get() as object),
  })
}

export { setActiveRouter } from "./context"

/** 获取当前活动的 router */
export function useRouter(): Router {
  return useRouterContext()
}

/** 获取当前路由参数（需要在 Router 组件内调用） */
export function useParams(): ReactiveSnapshot<RouteParams> {
  return toReactive(useRouter().params)
}

/** 获取当前查询参数（需要在 Router 组件内调用） */
export function useQuery(): ReactiveSnapshot<RouteQuery> {
  return toReactive(useRouter().query)
}

/** 获取当前 location（需要在 Router 组件内调用） */
export function useLocation(): ReactiveSnapshot<RouteLocation> {
  return toReactive(useRouter().location)
}

/** 获取当前匹配的路由记录 */
export function useRoute(): ReactiveSnapshot<{
  route: ReturnType<Router["currentRoute"]["get"]>
  matched: ReturnType<Router["matched"]["get"]>
  params: RouteParams
  query: RouteQuery
  location: RouteLocation
}> {
  const router = useRouter()
  const routeSignal = new Signal.Computed(() => ({
    route: router.currentRoute.get(),
    matched: router.matched.get(),
    params: router.params.get(),
    query: router.query.get(),
    location: router.location.get(),
  }))
  return toReactive(routeSignal)
}

/** 安全获取 router，可能返回 null */
export function tryUseRouter(): Router | null {
  return getActiveRouter()
}

/**
 * 返回当前路径是否命中 `to` 的响应式访问器（与 `Link` 同款分段感知逻辑）。
 * 默认非精确：/users 也会匹配 /users/:id 前缀；`exact` 时仅全等算命中。
 */
export function useIsActive(to: string, opts?: { exact?: boolean }): ReactiveSnapshot<boolean> {
  const router = useRouter()
  const exact = opts?.exact ?? false
  const signal = new Signal.Computed(() => isActivePath(router.path.get(), to, exact))
  return toReactive(signal)
}

/**
 * 返回当前路径对 `pattern` 的匹配参数（响应式），未匹配时为 null。
 * 复用独立 matcher，不依赖已配置的路由表。
 */
export function useMatch(pattern: string): ReactiveSnapshot<RouteParams | null> {
  const router = useRouter()
  const matcher = createMatcher([{ path: pattern }])
  const signal = new Signal.Computed(() => {
    const matches = matcher.matchAll(router.path.get())
    return matches.length > 0 ? matches[matches.length - 1]!.params : null
  })
  return toReactive(signal)
}

/** 真实 hook：读取活动 router 并返回其 navigate 绑定函数 */
export function useNavigate(): (
  to: NavPath | number,
  options?: { replace?: boolean; state?: unknown },
) => Promise<void> {
  const router = useRouter()
  return navigateFrom(router)
}
