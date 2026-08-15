import { Signal } from "signal-polyfill"

/**
 * A watchable signal — either `Signal.State` (writable) or `Signal.Computed`
 * (read-only derived).  Both expose `.get()` and are accepted by
 * `Signal.subtle.Watcher.watch()`.
 */
export type WatchableSignal<T> = Signal.State<T> | Signal.Computed<T>

export type Watcher = Signal.subtle.Watcher

/** Type guard: true for any standard watchable signal. */
export function isSignal(value: unknown): value is WatchableSignal<unknown> {
  return value instanceof Signal.State || value instanceof Signal.Computed
}

/** Convenience: create a `Signal.State<T>` (standard TC39 Signals interface). */
export function createSignal<T>(initial: T): Signal.State<T> {
  return new Signal.State(initial)
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
