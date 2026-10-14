/**
 * 开发期缓存击穿（dev cache bypass）—— 开发服务器与 HMR 共用的一小组工具。
 *
 * 开发时最容易踩的坑是「改了代码，浏览器拿到的还是旧的」：
 *
 * - **前端 GET 请求**：浏览器 / Service Worker / 反向代理都可能命中缓存，
 *   `GET /api/board` 拿到上一次的响应，观察不到服务端热重载的结果；
 * - **模块重新导入**：端点通知 `update` 后按模块 URL 重新 `import()`，若 URL
 *   不变（或每次整页刷新后重新从 1 计数），浏览器缓存会直接把旧模块还回来，
 *   热替换静默失效；
 * - **端点连接**：SSE 也是 GET，中间的缓存层可能把连接复用成旧响应。
 *
 * 这里统一用「开发模式下 GET 携带时间戳 param」绕开缓存；生产模式一律透传，
 * 不加参数、不改请求语义。`NODE_ENV` 的判定沿用 `@kikojs/dom` 的约定：
 * `process.env.NODE_ENV !== "production"` 即开发（bundler 会静态替换成常量，
 * 浏览器 bundle 因此也能正确判定）。
 *
 * 本模块只依赖 Fetch API 与 `process.env.NODE_ENV`，浏览器 / SSR 安全，
 * 不引入 `node:*` 或 `oxc-parser`，可被根入口直接导出。
 */

/** 通用开发期 cache-buster 查询参数名（时间戳 param）。 */
export const DEV_CACHE_PARAM = "kiko-dev"

/**
 * 模块热重载专用参数名。与 `DEV_CACHE_PARAM` 分开：模块 URL 由宿主自己
 * 提供（可能是 `http://…/counter.tsx`），保留原有拼写以兼容既有行为。
 */
export const HMR_RELOAD_PARAM = "kiko-hmr"

/**
 * 读取 `process.env.NODE_ENV`。bundler（Bun / Vite / esbuild / webpack）会把这个
 * 表达式静态替换成字符串常量，浏览器 bundle 里因此没有 `process` 引用；未经
 * bundler 的裸浏览器环境则根本没有 `process`，按「未设置」处理而不是抛错。
 */
function nodeEnv(): string | undefined {
  try {
    return process.env.NODE_ENV
  } catch {
    // 无 process 的运行时（裸浏览器、部分 worker）：当作未设置。
    return undefined
  }
}

/**
 * 开发模式判定：显式 `production` 才算生产，其余（含未设置）按开发处理——
 * 与 `@kikojs/dom` 的 dev 分支保持一致。
 */
export function isDevMode(): boolean {
  return nodeEnv() !== "production"
}

/** 往 URL 追加查询参数，保留已有 query 与 hash，并正确选择 `?` / `&`。 */
export function appendQueryParam(url: string, name: string, value: string | number): string {
  const hashIndex = url.indexOf("#")
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex)
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const hasQuery = base.includes("?")
  const separator = !hasQuery ? "?" : base.endsWith("?") || base.endsWith("&") ? "" : "&"
  return `${base}${separator}${encodeURIComponent(name)}=${encodeURIComponent(String(value))}${hash}`
}

export interface CacheBustOptions {
  /** 是否启用；默认 `isDevMode()`。 */
  dev?: boolean
  /** 时间戳：数字（测试固定值）或取当前时间的函数；默认 `Date.now`。 */
  stamp?: number | (() => number)
  /** 查询参数名；默认 `DEV_CACHE_PARAM`。 */
  param?: string
}

function resolveStamp(stamp: CacheBustOptions["stamp"]): number {
  if (typeof stamp === "function") return stamp()
  if (typeof stamp === "number") return stamp
  return Date.now()
}

/**
 * 开发模式下给 URL 追加时间戳 param；生产（或 `dev: false`）原样返回。
 *
 * ```ts
 * cacheBustUrl("/api/board")            // 开发 → /api/board?kiko-dev=1730000000000
 * cacheBustUrl("/api/board", { dev: false }) // 原样
 * ```
 */
export function cacheBustUrl(url: string, options: CacheBustOptions = {}): string {
  const dev = options.dev ?? isDevMode()
  if (!dev) return url
  return appendQueryParam(url, options.param ?? DEV_CACHE_PARAM, resolveStamp(options.stamp))
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (typeof URL !== "undefined" && input instanceof URL) return input.href
  return (input as Request).url
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request
}

/**
 * 开发期的 `fetch`：GET / HEAD 请求携带时间戳 param 并声明 `cache: "no-store"`，
 * 其它方法只声明不缓存；生产模式下与原生 `fetch` 完全一致（同样输入、同样 init）。
 *
 * ```ts
 * // 前端代码里替换 fetch("/api/board")
 * const response = await devFetch("/api/board")
 * ```
 */
export function devFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: CacheBustOptions = {},
): Promise<Response> {
  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch
  if (!fetchFn) {
    return Promise.reject(new Error("[kiko hmr] fetch is unavailable in this runtime"))
  }
  const dev = options.dev ?? isDevMode()
  if (!dev) return fetchFn(input, init)

  const cachedInit: RequestInit = { ...init, cache: "no-store" }
  const method = methodOf(input, init)
  if (method !== "GET" && method !== "HEAD") return fetchFn(input, cachedInit)

  const target = appendQueryParam(
    urlOf(input),
    options.param ?? DEV_CACHE_PARAM,
    resolveStamp(options.stamp),
  )
  if (isRequest(input)) return fetchFn(new Request(target, input), cachedInit)
  return fetchFn(target, cachedInit)
}

/**
 * 禁止缓存的响应头。覆盖 `no-store`（本次及后续都不存）、`no-cache`（存了也必须
 * 回源校验）、`max-age=0`、`must-revalidate`，并带上 HTTP/1.0 时代的 `pragma` /
 * `expires`——反向代理与老浏览器只看这些。
 */
export const NO_CACHE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store, no-cache, no-transform, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
}

/** 构造一份禁用缓存的响应头；`extra` 先写入，禁用缓存头始终生效。 */
export function noCacheHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  for (const name of Object.keys(NO_CACHE_HEADERS)) {
    headers.set(name, NO_CACHE_HEADERS[name]!)
  }
  return headers
}

/**
 * 复制一个响应并盖上禁用缓存头——开发服务器用它包住 HTML / 静态资源 / API
 * 响应，保证每次请求都真的回服务端。`extra` 可补充 / 覆盖其它头，
 * 但 `cache-control` / `pragma` / `expires` 始终是禁用缓存值。
 *
 * ```ts
 * Bun.serve({ routes: { "/api/board": () => withNoCache(getBoard()) } })
 * ```
 */
export function withNoCache(response: Response, extra?: HeadersInit): Response {
  // 101 Switching Protocols 无法用 Response 构造器重建（WebSocket 升级）。
  if (response.status === 101) return response
  const headers = new Headers(response.headers)
  noCacheHeaders(extra).forEach((value, name) => headers.set(name, value))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
