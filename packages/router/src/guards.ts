import type { RedirectDescriptor, RouteGuard, RouteLocation, Router } from "./types"

/** 创建一个守卫：当条件为 falsy 时重定向到指定路径 */
export function createAuthGuard(
  predicate: () => boolean | Promise<boolean>,
  redirectTo: string | RedirectDescriptor,
): RouteGuard {
  return async (_to: RouteLocation, _from: RouteLocation | null, _router: Router) => {
    const target = typeof redirectTo === "string" ? redirectTo : redirectTo.path
    if (_to.fullPath === target) return true
    const ok = await predicate()
    if (ok) return true
    return typeof redirectTo === "string" ? { path: redirectTo } : redirectTo
  }
}

/** 组合多个守卫，按顺序执行，遇到第一个拦截结果立即返回 */
export function combineGuards(...guards: RouteGuard[]): RouteGuard {
  return async (to, from, router) => {
    for (const guard of guards) {
      const result = await guard(to, from, router)
      if (
        result === false ||
        typeof result === "string" ||
        (typeof result === "object" && result && "path" in result)
      ) {
        return result
      }
    }
    return true
  }
}

/** 创建一个延迟守卫：模拟异步权限校验 */
export function createAsyncGuard(
  check: (to: RouteLocation, from: RouteLocation | null, router: Router) => Promise<boolean>,
  redirectTo: string,
): RouteGuard {
  return async (to, from, router) => {
    if (to.fullPath === redirectTo) return true
    const ok = await check(to, from, router)
    return ok || { path: redirectTo }
  }
}
