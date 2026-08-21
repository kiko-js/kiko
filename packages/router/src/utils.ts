import type { NavPath, RedirectDescriptor, RouteQuery, RouteRecord, Router } from "./types"

/** 重定向工具：返回一个 RedirectDescriptor */
export function redirect(path: NavPath, state?: unknown): RedirectDescriptor {
  return { path, state }
}

/** 重定向工具（替换当前历史记录） */
export function redirectReplace(path: NavPath, state?: unknown): RedirectDescriptor {
  return { path, replace: true, state }
}

/**
 * 声明路由表：原样返回，但保留 path 的字面量类型，供
 * `RoutePaths<typeof routes>` 展开导航目标联合。
 */
export function defineRoutes<const R extends readonly RouteRecord[]>(routes: R): R {
  return routes
}

/** 构建带查询字符串的路径 */
export function buildPath(path: NavPath, query?: RouteQuery): string {
  if (!query || Object.keys(query).length === 0) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v)
    } else {
      params.append(key, value)
    }
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** 从 query 对象读取单个值 */
export function getQueryValue(query: RouteQuery, key: string): string | undefined {
  const value = query[key]
  return Array.isArray(value) ? value[0] : value
}

/** 比较两个路径是否匹配（忽略尾部斜杠和查询字符串） */
export function pathsEqual(a: string, b: string): boolean {
  const normalize = (s: string) => s.split("?")[0]!.replace(/#.*$/, "").replace(/\/$/, "") || "/"
  return normalize(a) === normalize(b)
}

/** 在当前 router 上执行导航（注意：这是柯里化函数，不是 hook）。 */
export function navigateFrom(
  router: Router,
): (to: NavPath | number, options?: { replace?: boolean; state?: unknown }) => Promise<void> {
  return (to, options) => router.navigate(to, options)
}

/** 向后兼容别名：保留旧的 useNavigate 名字指向 navigateFrom。 */
export const useNavigate = navigateFrom

/** 跳转到外部链接 */
export function openExternal(url: string, target: string = "_blank"): void {
  window.open(url, target)
}
