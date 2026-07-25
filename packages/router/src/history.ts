export interface HistoryAdapter {
  /** 获取当前路径（不含 base，path 模式不带 #） */
  getPath(): string
  /** 获取当前 hash（hash 模式下包含 # 后的内容） */
  getHash(): string
  /** 导航到指定路径 */
  push(path: string, state?: unknown): void
  /** 替换当前历史记录 */
  replace(path: string, state?: unknown): void
  /** 前进/后退 */
  go(delta: number): void
  /** 监听变化 */
  listen(callback: () => void): () => void
  /** 清理 */
  dispose(): void
}

interface BrowserHistoryEnv {
  location: Pick<Location, "pathname" | "search" | "hash">
  history: Pick<History, "pushState" | "replaceState" | "go">
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

/** path 模式 history 适配器 */
export function createPathHistory(
  base: string = "",
  env: BrowserHistoryEnv = getBrowserEnv(),
): HistoryAdapter {
  const normalizedBase = base.replace(/\/$/, "")

  function getFullPath(): string {
    const { pathname, search, hash } = env.location
    return pathname + search + hash
  }

  function getPath(): string {
    const full = getFullPath()
    return normalizedBase && full.startsWith(normalizedBase)
      ? full.slice(normalizedBase.length) || "/"
      : full || "/"
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
    getHash: () => env.location.hash.slice(1),
    push,
    replace,
    go: (delta: number) => env.history.go(delta),
    listen,
    dispose: () => {},
  }
}

/** hash 模式 history 适配器 */
export function createHashHistory(env: BrowserHistoryEnv = getBrowserEnv()): HistoryAdapter {
  function getHash(): string {
    return env.location.hash.slice(1) || "/"
  }

  function getPath(): string {
    return getHash().split("?")[0] ?? "/"
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
    listen,
    dispose: () => {},
  }
}
