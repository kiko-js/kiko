export interface HistoryAdapter {
  /** 获取当前路由路径：不含 base、不含 # 片段，包含 query（两种模式语义一致） */
  getPath(): string
  /** 获取当前 hash 片段：不含 #，无片段则为空字符串（两种模式语义一致） */
  getHash(): string
  /** 导航到指定路径 */
  push(path: string, state?: unknown): void
  /** 替换当前历史记录 */
  replace(path: string, state?: unknown): void
  /** 前进/后退 */
  go(delta: number): void
  /** 获取当前 history.state */
  getState(): unknown
  /** 监听变化 */
  listen(callback: () => void): () => void
  /** 清理 */
  dispose(): void
}

interface BrowserHistoryEnv {
  location: Pick<Location, "pathname" | "search" | "hash">
  history: Pick<History, "pushState" | "replaceState" | "go" | "state">
  addEventListener: Window["addEventListener"]
  removeEventListener: Window["removeEventListener"]
}

function getBrowserEnv(): BrowserHistoryEnv {
  return {
    location: window.location,
    history: window.history,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
  }
}

/**
 * path 模式 history 适配器。
 *
 * ⚠️ 客户端专用：构造时会立即读取 `window.location` / `window.history`，
 * 因此只能在浏览器/DOM 环境中实例化。SSR 场景不应在服务器上创建本适配器——
 * 应在服务端根据请求路径解析出对应 route 并直接预渲染该路由内容，客户端
 * 水合时再创建本适配器接管后续的导航。
 */
export function createPathHistory(
  base: string = "",
  env: BrowserHistoryEnv = getBrowserEnv(),
): HistoryAdapter {
  const normalizedBase = base.replace(/\/$/, "")

  function getPath(): string {
    const full = env.location.pathname + env.location.search
    if (normalizedBase && (full === normalizedBase || full.startsWith(normalizedBase + "/"))) {
      return full.slice(normalizedBase.length) || "/"
    }
    return full || "/"
  }

  function getHash(): string {
    return env.location.hash.slice(1)
  }

  function buildFullPath(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    const normalized = path.startsWith("/") ? path : "/" + path
    return normalizedBase + normalized
  }

  function push(path: string, state?: unknown): void {
    env.history.pushState(state ?? null, "", buildFullPath(path))
  }

  function replace(path: string, state?: unknown): void {
    env.history.replaceState(state ?? null, "", buildFullPath(path))
  }

  function listen(callback: () => void): () => void {
    const handler = () => callback()
    env.addEventListener("popstate", handler)
    return () => env.removeEventListener("popstate", handler)
  }

  return {
    getPath,
    getHash,
    push,
    replace,
    go: (delta: number) => env.history.go(delta),
    getState: () => env.history.state,
    listen,
    dispose: () => {},
  }
}

/**
 * hash 模式 history 适配器。
 *
 * ⚠️ 客户端专用：同样在构造时读取 `window.location` / `window.history`，仅
 * 适用于浏览器/DOM 环境。SSR 请服务端预渲染解析出的 route，客户端水合时
 * 再创建本适配器。
 */
export function createHashHistory(env: BrowserHistoryEnv = getBrowserEnv()): HistoryAdapter {
  function getPath(): string {
    const raw = env.location.hash.slice(1) || "/"
    const hashIndex = raw.indexOf("#")
    return hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
  }

  function getHash(): string {
    const raw = env.location.hash.slice(1)
    const hashIndex = raw.indexOf("#")
    return hashIndex >= 0 ? raw.slice(hashIndex + 1) : ""
  }

  function push(path: string, state?: unknown): void {
    env.history.pushState(state ?? null, "", "#" + path)
  }

  function replace(path: string, state?: unknown): void {
    env.history.replaceState(state ?? null, "", "#" + path)
  }

  function listen(callback: () => void): () => void {
    const handler = () => callback()
    env.addEventListener("hashchange", handler)
    return () => env.removeEventListener("hashchange", handler)
  }

  return {
    getPath,
    getHash,
    push,
    replace,
    go: (delta: number) => env.history.go(delta),
    getState: () => env.history.state,
    listen,
    dispose: () => {},
  }
}
