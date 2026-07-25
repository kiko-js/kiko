import type { RouteMatch, RouteParams, RouteRecord } from "./types"

export interface Matcher {
  match(path: string): RouteMatch | null
  matchAll(path: string): RouteMatch[]
}

interface CompiledRoute {
  route: RouteRecord
  exactRegex: RegExp
  prefixRegex: RegExp | null
  paramNames: string[]
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
  const exactRegex = new RegExp(`^${pattern}(?:/)?$`, "i")
  const prefixRegex = hasChildren ? new RegExp(`^${pattern}(?:/|$)`, "i") : null

  return { route, exactRegex, prefixRegex, paramNames }
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
  const compiled = routes.map(compileRoute)

  function match(path: string): RouteMatch | null {
    const normalized = normalizeForMatch(path)
    for (const item of compiled) {
      const m = item.exactRegex.exec(normalized)
      if (!m) continue
      const params = extractParams(item, m)
      const consumed = m[0]!.replace(/\/$/, "")
      const remaining = stripLeadingSlash(normalized.slice(consumed.length))
      return { route: item.route, params, remaining }
    }
    return null
  }

  function matchAll(path: string): RouteMatch[] {
    const normalized = normalizeForMatch(path)
    const matches: RouteMatch[] = []
    let remaining = stripLeadingSlash(normalized)
    let candidates: RouteRecord[] = routes

    while (candidates.length > 0) {
      const compiledCandidates = candidates.map(compileRoute)
      const item = compiledCandidates.find(c =>
        c.prefixRegex ? c.prefixRegex.test("/" + remaining) : c.exactRegex.test("/" + remaining),
      )
      if (!item) break
      const regex = item.prefixRegex ?? item.exactRegex
      const m = regex.exec("/" + remaining)!
      const params = extractParams(item, m)
      const consumed = m[0]!.replace(/\/$/, "")
      matches.push({ route: item.route, params, remaining })
      remaining = stripLeadingSlash(remaining.slice(consumed.length - 1))
      candidates = item.route.children ?? []
    }

    return matches
  }

  return { match, matchAll }
}
