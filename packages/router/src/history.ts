import { createSignal } from "@kikojs/signal"
import type { HistoryAdapter, HistoryLocation } from "./types"

/**
 * 响应式 history 适配器（效仿 TanStack Router）：
 * - `location` 是唯一事实源的信号，push/replace/go 与浏览器事件都会同步它；
 * - 消费方（router）用 effect 订阅，外部变化（popstate / hashchange / go /
 *   共享同一 history 的其他 router）统一从信号变化进入守卫管线；
 * - 三种实现（path / hash / memory）接口完全一致。
 */

export interface BrowserHistoryEnv {
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

/** 拆出第一个 `#` 后的片段（query 属于 path 部分） */
function splitHash(raw: string): { path: string; hash: string } {
  const i = raw.indexOf("#")
  return i >= 0 ? { path: raw.slice(0, i), hash: raw.slice(i + 1) } : { path: raw, hash: "" }
}

/**
 * path 模式。⚠️ 客户端专用：构造时读取 `window.location` / `window.history`。
 * SSR 请使用 `createMemoryHistory`，或服务端直接解析请求路径预渲染。
 */
export function createPathHistory(
  base = "",
  env: BrowserHistoryEnv = getBrowserEnv(),
): HistoryAdapter {
  const normalizedBase = base.replace(/\/$/, "")

  const read = (): HistoryLocation => {
    const full = env.location.pathname + env.location.search
    const path =
      normalizedBase && (full === normalizedBase || full.startsWith(normalizedBase + "/"))
        ? full.slice(normalizedBase.length) || "/"
        : full || "/"
    return { path, hash: env.location.hash.slice(1), state: env.history.state }
  }

  const location = createSignal<HistoryLocation>(read())
  const sync = (): void => {
    location.set(read())
  }

  env.addEventListener("popstate", sync)

  const buildFullPath = (path: string): string => {
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    const normalized = path.startsWith("/") ? path : "/" + path
    return normalizedBase + normalized
  }

  return {
    kind: "path",
    location,
    push(path, state) {
      env.history.pushState(state ?? null, "", buildFullPath(path))
      sync()
    },
    replace(path, state) {
      env.history.replaceState(state ?? null, "", buildFullPath(path))
      sync()
    },
    go: delta => env.history.go(delta),
    back: () => env.history.go(-1),
    forward: () => env.history.go(1),
    dispose: () => env.removeEventListener("popstate", sync),
  }
}

/**
 * hash 模式。⚠️ 客户端专用：同样在构造时读取 `window.location` / `window.history`。
 */
export function createHashHistory(env: BrowserHistoryEnv = getBrowserEnv()): HistoryAdapter {
  const read = (): HistoryLocation => {
    const raw = env.location.hash.slice(1) || "/"
    const { path, hash } = splitHash(raw)
    return { path, hash, state: env.history.state }
  }

  const location = createSignal<HistoryLocation>(read())
  const sync = (): void => {
    location.set(read())
  }

  env.addEventListener("hashchange", sync)

  return {
    kind: "hash",
    location,
    push(path, state) {
      env.history.pushState(state ?? null, "", "#" + path)
      sync()
    },
    replace(path, state) {
      env.history.replaceState(state ?? null, "", "#" + path)
      sync()
    },
    go: delta => env.history.go(delta),
    back: () => env.history.go(-1),
    forward: () => env.history.go(1),
    dispose: () => env.removeEventListener("hashchange", sync),
  }
}

/**
 * 内存模式：条目数组 + 游标，无任何 DOM 依赖。适用于测试、SSR、
 * 原生壳（WebView 以外的渲染环境）以及需要完全隔离导航的场景。
 */
export function createMemoryHistory(initialPath = "/"): HistoryAdapter {
  const initial = splitHash(initialPath)
  const entries: { path: string; hash: string; state: unknown }[] = [
    { path: initial.path, hash: initial.hash, state: null },
  ]
  let index = 0

  const location = createSignal<HistoryLocation>({
    path: entries[0]!.path,
    hash: entries[0]!.hash,
    state: null,
  })

  const settle = (): void => {
    const entry = entries[index]!
    location.set({ path: entry.path, hash: entry.hash, state: entry.state })
  }

  const move = (delta: number): void => {
    const next = Math.min(Math.max(index + delta, 0), entries.length - 1)
    if (next === index) return
    index = next
    settle()
  }

  return {
    kind: "memory",
    location,
    push(path, state) {
      const { path: p, hash } = splitHash(path)
      entries.splice(index + 1)
      entries.push({ path: p, hash, state: state ?? null })
      index++
      settle()
    },
    replace(path, state) {
      const { path: p, hash } = splitHash(path)
      entries[index] = { path: p, hash, state: state ?? null }
      settle()
    },
    go: move,
    back: () => move(-1),
    forward: () => move(1),
    dispose: () => {},
  }
}
