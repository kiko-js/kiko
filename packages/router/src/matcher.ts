import type { RouteMatch, RouteParams, RouteRecord } from "./types"

export interface Matcher {
  matchAll(path: string): RouteMatch[]
}

interface CompiledRoute {
  route: RouteRecord
  exactRegex: RegExp
  prefixRegex: RegExp | null
  paramNames: string[]
  /** 预编译的子路由（matchAll 逐层下钻时无需重新编译） */
  children: CompiledRoute[]
}

/** 去除尾部斜杠，保留前导斜杠 */
function normalizeForMatch(path: string): string {
  return path.replace(/\/*$/, "") || "/"
}

/** 去除前导斜杠，用于嵌套匹配时的剩余路径 */
function stripLeadingSlash(path: string): string {
  return path.replace(/^\//, "")
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 将路径模式编译为正则 */
function compileRoute(route: RouteRecord): CompiledRoute {
  const paramNames: string[] = []
  const normalized = route.path.replace(/\/$/, "").replace(/^\//, "")
  let pattern = ""
  const segments = normalized === "" ? [] : normalized.split("/")

  for (const segment of segments) {
    pattern += "/"
    if (segment === "*") {
      paramNames.push("__wild")
      pattern += "(.*)"
    } else if (segment.startsWith(":")) {
      const match = /^:(\w+)(\?)?(?:\(([^)]+)\))?$/.exec(segment)
      if (!match) {
        pattern += escapeRegex(segment)
      } else {
        const name = match[1]!
        const optional = match[2] === "?"
        const custom = match[3]
        paramNames.push(name)
        const inner = custom ? custom.replace(/\\\//g, "/") : "[^/]+"
        pattern += optional ? `(?:(${inner}))?` : `(${inner})`
      }
    } else {
      pattern += escapeRegex(segment)
    }
  }

  const hasChildren = (route.children?.length ?? 0) > 0
  const exactRegex = new RegExp(`^${pattern}(?:/)?$`)
  const prefixRegex = hasChildren ? new RegExp(`^${pattern}(?:/|$)`) : null

  return {
    route,
    exactRegex,
    prefixRegex,
    paramNames,
    children: compileRoutes(route.children ?? []),
  }
}

/** 递归编译整个路由树（顶层与每层 children），创建时一次完成 */
function compileRoutes(routes: readonly RouteRecord[]): CompiledRoute[] {
  return routes.map(compileRoute)
}

function extractParams(item: CompiledRoute, match: RegExpExecArray): RouteParams {
  const params: RouteParams = {}
  for (let i = 0; i < item.paramNames.length; i++) {
    const name = item.paramNames[i]!
    const value = match[i + 1]
    if (value === undefined) continue
    if (name === "__wild") {
      params["*"] = value
    } else {
      params[name] = value
    }
  }
  return params
}

/** 创建路由匹配器 */
export function createMatcher(routes: RouteRecord[]): Matcher {
  const compiled = compileRoutes(routes)

  // 顶层 catch-all：path === "*" 作为 404 兜底，仅当没有任何其他路由匹配
  // 完整路径时才被使用。
  const catchAll = compiled.find(item => item.route.path === "*")?.route ?? null

  function matchAll(path: string): RouteMatch[] {
    const normalized = normalizeForMatch(path)
    const matches: RouteMatch[] = []
    let remaining = stripLeadingSlash(normalized)
    let candidates: CompiledRoute[] = compiled

    while (candidates.length > 0) {
      // Single exec per candidate: the previous test-then-exec ran every
      // regex twice on the winning route.
      let item: CompiledRoute | undefined
      let m: RegExpExecArray | null = null
      for (const c of candidates) {
        m = (c.prefixRegex ?? c.exactRegex).exec("/" + remaining)
        if (m) {
          item = c
          break
        }
      }
      if (!item || !m) break
      const params = extractParams(item, m)
      const consumed = m[0]!.replace(/\/$/, "")
      matches.push({ route: item.route, params, remaining })
      // consumed 含前导 "/"，减 1 得到剩余路径应切掉的长度；根路由 "/" 时
      // consumed 被剥成空串（长度 -1），钳制到 0 避免 slice(-1) 吃掉字符。
      remaining = stripLeadingSlash(remaining.slice(Math.max(consumed.length - 1, 0)))
      candidates = item.children
    }

    // 零匹配，或最深的匹配未消费完整路径（如 /users/abc 落在 users 的
    // children 上但无一命中）→ 追加 catch-all 兜底，避免静默渲染空 Outlet。
    if (catchAll && (matches.length === 0 || remaining !== "")) {
      matches.push({ route: catchAll, params: {}, remaining: "" })
    }

    return matches
  }

  return { matchAll }
}
