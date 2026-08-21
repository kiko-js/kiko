import { createSignal } from "@kikojs/signal"
import type { EntryScroll, HistoryAdapter, HistoryLocation } from "./types"

/**
 * 响应式 history 适配器（效仿 TanStack Router）：
 * - `location` 是唯一事实源的信号，push/replace/go 与浏览器事件都会同步它；
 * - 消费方（router）用 effect 订阅，外部变化（popstate / hashchange / go /
 *   共享同一 history 的其他 router）统一从信号变化进入守卫管线；
 * - 三种实现（path / hash / memory）接口完全一致。
 *
 * 用户 state 与条目滚动位置一起包装进真实的 history.state（`__kiko__` 键），
 * `location.state` 始终解包为用户原始值——包装对消费方透明。
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

// ---------------------------------------------------------------------------
// state 包装：{ __kiko__: { user, scroll } }

const STATE_KEY = "__kiko__"

interface WrappedState {
  user?: unknown
  scroll?: EntryScroll
}

function isWrapped(raw: unknown): raw is Record<typeof STATE_KEY, WrappedState> {
  return typeof raw === "object" && raw !== null && STATE_KEY in raw
}

function wrapState(user: unknown, scroll?: EntryScroll): Record<typeof STATE_KEY, WrappedState> {
  return { [STATE_KEY]: { user, scroll } }
}

/** 解包出用户原始 state；非包装形态（外部写入的 state）原样返回 */
function unwrapState(raw: unknown): unknown {
  if (isWrapped(raw)) return raw[STATE_KEY].user
  return raw
}

function scrollOf(raw: unknown): EntryScroll | undefined {
  if (isWrapped(raw)) return raw[STATE_KEY].scroll
  return undefined
}

/** 仅替换包装对象里的滚动字段，保留用户 state */
function withScroll(
  raw: unknown,
  scroll: EntryScroll | undefined,
): Record<typeof STATE_KEY, WrappedState> {
  if (isWrapped(raw)) {
    return { [STATE_KEY]: { user: raw[STATE_KEY].user, scroll } }
  }
  return wrapState(raw, scroll)
}

/**
 * scrollRestoration 接管的引用计数：配置了 scrollBehavior 的 router 都存在时
 * 保持 "manual"，最后一个释放后恢复 "auto"。
 */
let scrollRestorationOwners = 0

export function claimManualScrollRestoration(): boolean {
  if (typeof window === "undefined") return false
  if (++scrollRestorationOwners === 1) window.history.scrollRestoration = "manual"
  return true
}

export function releaseManualScrollRestoration(): void {
  scrollRestorationOwners = Math.max(scrollRestorationOwners - 1, 0)
  if (scrollRestorationOwners === 0 && typeof window !== "undefined") {
    window.history.scrollRestoration = "auto"
  }
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
    return { path, hash: env.location.hash.slice(1), state: unwrapState(env.history.state) }
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
      env.history.pushState(wrapState(state), "", buildFullPath(path))
      sync()
    },
    replace(path, state) {
      env.history.replaceState(wrapState(state), "", buildFullPath(path))
      sync()
    },
    go: delta => env.history.go(delta),
    back: () => env.history.go(-1),
    forward: () => env.history.go(1),
    getEntryScroll: () => scrollOf(env.history.state),
    setEntryScroll(scroll) {
      const url = env.location.pathname + env.location.search + env.location.hash
      env.history.replaceState(withScroll(env.history.state, scroll), "", url)
    },
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
    return { path, hash, state: unwrapState(env.history.state) }
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
      env.history.pushState(wrapState(state), "", "#" + path)
      sync()
    },
    replace(path, state) {
      env.history.replaceState(wrapState(state), "", "#" + path)
      sync()
    },
    go: delta => env.history.go(delta),
    back: () => env.history.go(-1),
    forward: () => env.history.go(1),
    getEntryScroll: () => scrollOf(env.history.state),
    setEntryScroll(scroll) {
      const url = "#" + (env.location.hash.slice(1) || "/")
      env.history.replaceState(withScroll(env.history.state, scroll), "", url)
    },
    dispose: () => env.removeEventListener("hashchange", sync),
  }
}

/**
 * 内存模式：条目数组 + 游标，无任何 DOM 依赖。适用于测试、SSR、
 * 原生壳（WebView 以外的渲染环境）以及需要完全隔离导航的场景。
 */
export function createMemoryHistory(initialPath = "/"): HistoryAdapter {
  const initial = splitHash(initialPath)
  const entries: { path: string; hash: string; state: unknown; scroll?: EntryScroll }[] = [
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
    getEntryScroll: () => entries[index]!.scroll,
    setEntryScroll(scroll) {
      entries[index]!.scroll = scroll
    },
    dispose: () => {},
  }
}
