import { Signal } from "signal-polyfill"
import { trackSignal, nextRestoreValue, noteRestoreType } from "./signal-serialize"
import { getHmrRegistry } from "@kikojs/hmr"
import { isHydrating } from "./hydrate"
/**
 * A watchable signal — either `Signal.State` (writable) or `Signal.Computed`
 * (read-only derived).  Both expose `.get()` and are accepted by
 * `Signal.subtle.Watcher.watch()`.
 */
export type WatchableSignal<T> = Signal.State<T> | Signal.Computed<T>

export type Watcher = Signal.subtle.Watcher

/**
 * Type guard: true for any standard watchable signal.
 *
 * Uses duck-typing (constructor-name + accessor shape) instead of `instanceof`
 * so a signal created by a *different* copy of `signal-polyfill` (the
 * dual-package hazard when `@kikojs/dom` bundles its own copy) is still
 * recognised. `State` exposes `get`+`set`, `Computed` exposes `get` only; both
 * are named identically across copies. kiko store proxy nodes are callable
 * proxies (typeof "function") and are excluded by the typeof guard.
 */
export function isSignal(value: unknown): value is WatchableSignal<unknown> {
  if (value === null || typeof value !== "object") return false
  const v = value as Record<PropertyKey, unknown>
  if (typeof v.get !== "function") return false
  const ctor = (value as { constructor?: { name?: string } }).constructor
  const name = ctor?.name
  if (name === "State" || name === "Computed") return true
  // Generic fallback: any get+set accessor object is treated as a State-like signal.
  return typeof v.set === "function"
}

/** Convenience: create a `Signal.State<T>` (standard TC39 Signals interface). */
export function createSignal<T>(initial: T): Signal.State<T> {
  // HMR 热替换模式：实例/模块作用域内复用旧信号对象（身份与值保留）。
  // 水合期例外：此时必须走下面的恢复路径消费 SSR 快照，HMR 复用会把快照
  // 整体吞掉（组件信号在 dev 下全部退回初始值）。
  //
  // `process.env.NODE_ENV` 是给 bundler（Bun / Vite / esbuild / webpack）的
  // 裸字面量：构建期被静态替换为字面量，生产构建下整个分支连同
  // `@kikojs/hmr` 的 import 一起被 DCE——生产包不含 HMR 代码。因此这里刻意
  // 不加 `typeof process` 守卫（那会让表达式无法折叠）。浏览器侧代码必经
  // bundler 处理（`@kikojs/dom` 使用裸模块说明符，无法直接在浏览器解析），
  // 运行期不会真正求值 `process`。
  if (process.env.NODE_ENV !== "production" && !isHydrating()) {
    const hmr = getHmrRegistry()?.takeSignal(initial)
    if (hmr) return hmr as Signal.State<T>
  }
  // 恢复模式：用序列化值替代初始值（客户端水合前恢复服务端状态）
  const restored = nextRestoreValue()
  const value = restored !== undefined ? (restored as T) : initial
  if (restored !== undefined) noteRestoreType(restored, initial)
  const sig = new Signal.State(value)
  // 捕获模式：记录信号供序列化（服务端渲染后嵌入 HTML）
  trackSignal(sig)
  return sig
}

/** Create a `Signal.subtle.Watcher` — the standard signal-polyfill API. */
export function createWatcher(callback: () => void): Watcher {
  return new Signal.subtle.Watcher(callback)
}

/**
 * 安全的上报钩子：调用时查找宿主 `globalThis.reportError`（测试可
 * monkey-patch），缺失时退回 `console.error`；上报本身抛错不中断调用方。
 */
export function reportError(err: unknown): void {
  try {
    if (typeof globalThis.reportError === "function") {
      globalThis.reportError(err)
    } else {
      console.error(err)
    }
  } catch {
    // 上报失败不能影响调用方（如绑定渲染的回调链）
  }
}

/**
 * 订阅单个信号：变化后在微任务中执行 `run`（signal-polyfill 的通知阶段读
 * 信号会抛错，必须延迟到微任务），随后重新武装 watcher。
 *
 * `run` 抛错会被上报，但 re-arm 由 `finally` 保证——one-shot watcher 不会
 * 因为一次渲染错误而永久失效（否则该绑定从此静默死亡）。
 */
export function watchSignal<T>(signal: WatchableSignal<T>, run: () => void): Watcher {
  const watcher = new Signal.subtle.Watcher(() => {
    queueMicrotask(() => {
      try {
        run()
      } catch (err) {
        reportError(err)
      } finally {
        watcher.watch(signal)
      }
    })
  })
  watcher.watch(signal)
  return watcher
}
