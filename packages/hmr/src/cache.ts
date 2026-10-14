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

/* ------------------------------------------------------------------ *
 * 开发服务器静态资源的缓存策略（html / js / css ...）。
 * ------------------------------------------------------------------ */

/**
 * 开发服务器的三种缓存策略：
 *
 * - `no-store`：HTML（导航响应）——不落盘、不复用，彻底避免旧壳 + 新资源的错配；
 * - `revalidate`：未带内容 hash 的应用代码 / 未 hash 的 vendor（js / css / json）——
 *   每次都回源校验，服务端给了 `etag` / `last-modified` 时命中 304，既不会拿到
 *   旧文件、也不用重下未变化的文件；
 * - `immutable`：文件名里带内容 hash 的资源——内容变了文件名就变，可以放心长缓存。
 */
export type DevCacheKind = "no-store" | "revalidate" | "immutable"

/**
 * 默认的「内容 hash 文件名」模式：`. ` / `-` 分隔的 ≥8 位十六进制段 + 扩展名。
 * 覆盖 `index-00000000111d3582.js`（Bun）、`vendor.a1b2c3d4e5.css`、
 * `app-9f8e7d6c.js` 等；`my-component.js` 这类普通命名不会被误判。
 */
export const DEV_HASHED_ASSET = /(?:^|[.-])[0-9a-f]{8,}(?=\.[a-z0-9]+$)/i

const REVALIDATE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
}

const IMMUTABLE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "public, max-age=31536000, immutable",
}

export interface DevCacheOptions {
  /** 资源 URL（用于文件名 hash 判定）；缺省时退回 `response.url`。 */
  url?: string | Request | URL
  /** 显式指定策略，跳过自动判定。 */
  kind?: DevCacheKind
  /** 自定义「带内容 hash」的文件名模式；默认 `DEV_HASHED_ASSET`。 */
  hashed?: RegExp
  /**
   * 是否只在开发模式生效：默认按 `isDevMode()`；传 `true` 强制生效，
   * 传 `false` 原样透传（可用于把同一份处理器部署到生产）。
   */
  dev?: boolean
  /** 额外响应头；缓存相关头由策略决定，不会被 `headers` 覆盖。 */
  headers?: HeadersInit
}

function pathOf(url: string): string {
  const end = url.search(/[?#]/)
  return end === -1 ? url : url.slice(0, end)
}

/** 按响应类型 + URL 判定开发期缓存策略（不修改响应）。 */
export function devCacheKind(response: Response, options: DevCacheOptions = {}): DevCacheKind {
  if (options.kind) return options.kind
  // HTML 导航响应最严格：旧 HTML 引用旧资源，是开发期最典型的「改了没生效」。
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("html")) return "no-store"
  const url =
    typeof options.url === "string" ? options.url : options.url ? urlOf(options.url) : response.url
  if (url && (options.hashed ?? DEV_HASHED_ASSET).test(pathOf(url))) return "immutable"
  return "revalidate"
}

/** 只取该响应应带的缓存头（`options.headers` 先写入，缓存头始终生效）。 */
export function devCacheHeaders(response: Response, options: DevCacheOptions = {}): Headers {
  const kind = devCacheKind(response, options)
  const base =
    kind === "no-store"
      ? NO_CACHE_HEADERS
      : kind === "immutable"
        ? IMMUTABLE_HEADERS
        : REVALIDATE_HEADERS
  const headers = new Headers(options.headers)
  for (const name of Object.keys(base)) headers.set(name, base[name]!)
  return headers
}

/**
 * 给开发服务器返回的 HTML / JS / CSS 盖上合适的缓存头：
 * HTML `no-store`、未 hash 的资源 `no-cache`（回源校验）、带内容 hash 的
 * 资源 `immutable`。生产模式（或 `dev: false`）原样返回，可用于同一份处理器。
 *
 * ```ts
 * Bun.serve({
 *   fetch: async request => withDevCache(await renderSomePage(), { url: request.url }),
 * })
 * ```
 */
export function withDevCache(response: Response, options: DevCacheOptions = {}): Response {
  const dev = options.dev ?? isDevMode()
  // 101 Switching Protocols 无法用 Response 构造器重建（WebSocket 升级）。
  if (!dev || response.status === 101) return response
  const headers = new Headers(response.headers)
  // 先清掉原响应上的缓存头，避免旧的 expires / pragma 与本次策略打架。
  for (const name of ["cache-control", "pragma", "expires"]) headers.delete(name)
  devCacheHeaders(response, options).forEach((value, name) => headers.set(name, value))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
