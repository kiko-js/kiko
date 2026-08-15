import { getActiveRouter, useRouter as useRouterContext } from "./context"
import { Signal } from "signal-polyfill"
import type { RouteLocation, RouteParams, RouteQuery, Router } from "./types"

/** A live snapshot: call it like an accessor, read `.get()`, or access fields directly. */
export type ReactiveSnapshot<T extends object> = T & {
  (): T
  get(): T
}

function toReactive<T extends object>(
  signal: Signal.State<T> | Signal.Computed<T>,
): ReactiveSnapshot<T> {
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
