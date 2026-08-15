import { Signal } from "signal-polyfill"
import { isSignal } from "./signal"
import { reportError } from "./report"
import { runWithoutScope } from "./scope"

/**
 * User-facing `computed()` values are read-only: writing inside them is almost
 * always a bug. signal-polyfill enables writes for every Computed, so we guard
 * only the computeds created through this module (internal `new
 * Signal.Computed` users, such as `effect()` and control flow, are unaffected).
 */
let computedWriteDepth = 0

const originalStateSet = Signal.State.prototype.set
Signal.State.prototype.set = function (this: Signal.State<unknown>, newValue: unknown): void {
  if (computedWriteDepth > 0) {
    throw new Error("Signal writes are not allowed inside a computed")
  }
  return originalStateSet.call(this, newValue)
}

/**
 * Create a standard `Signal.Computed<T>` — the TC39 Signals interface.
 * Other kiko packages consume only this standard type.
 */
export function computed<T>(fn: () => T): Signal.Computed<T> {
  return new Signal.Computed(() => {
    computedWriteDepth++
    try {
      return runWithoutScope(fn)
    } finally {
      computedWriteDepth--
    }
  })
}

/** Alias for `computed`. */
export function derived<T>(fn: () => T): Signal.Computed<T> {
  return computed(fn)
}

/** Unwrap a value that may be a signal; plain values pass through. */
export function toSignalValue<T>(value: T | Signal.State<T> | Signal.Computed<T>): T {
  if (isSignal(value)) return value.get() as T
  return value as T
}

/**
 * Watch a signal (or plain value) and invoke `callback` on change.
 * For non-signal values the callback fires immediately and `null` is returned.
 * Returns a `Signal.subtle.Watcher` the caller is responsible for managing.
 *
 * Signal callbacks run on a microtask: `signal-polyfill` invokes watcher
 * callbacks synchronously inside the notification phase, where reading the
 * signal throws ("signal read during notification phase"). The microtask
 * defers the read until after the phase ends; the watcher is re-armed after
 * each callback (signal-polyfill watchers are one-shot).
 */
export function watchValue<T>(
  value: T | Signal.State<T> | Signal.Computed<T>,
  callback: (value: T) => void,
): Signal.subtle.Watcher | null {
  if (!isSignal(value)) {
    callback(value as T)
    return null
  }

  const signal = value as Signal.State<T> | Signal.Computed<T>
  const watcher = new Signal.subtle.Watcher(() => {
    queueMicrotask(() => {
      // 回调抛错不得让 one-shot watcher 永久失效：错误上报后仍在
      // finally 中 re-arm，后续更新照常送达。
      try {
        callback(signal.get())
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
