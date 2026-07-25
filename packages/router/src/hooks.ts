import { getActiveRouter, useRouter as useRouterContext } from "./context"
import type { RouteLocation, RouteParams, RouteQuery, Router } from "./types"

export { setActiveRouter } from "./context"

/** 获取当前活动的 router */
export function useRouter(): Router {
  return useRouterContext()
}

/** 获取当前路由参数（需要在 Router 组件内调用） */
export function useParams(): RouteParams {
  return useRouter().params.get()
}

/** 获取当前查询参数（需要在 Router 组件内调用） */
export function useQuery(): RouteQuery {
  return useRouter().query.get()
}

/** 获取当前 location（需要在 Router 组件内调用） */
export function useLocation(): RouteLocation {
  return useRouter().location.get()
}

/** 获取当前匹配的路由记录 */
export function useRoute() {
  const router = useRouter()
  return {
    route: router.currentRoute.get(),
    matched: router.matched.get(),
    params: router.params.get(),
    query: router.query.get(),
    location: router.location.get(),
  }
}

/** 安全获取 router，可能返回 null */
export function tryUseRouter(): Router | null {
  return getActiveRouter()
}
