import { Signal } from "signal-polyfill"
import { isSignal } from "./signal"

/**
 * Create a standard `Signal.Computed<T>` — the TC39 Signals interface.
 * Other kiko packages consume only this standard type.
 */
export function computed<T>(fn: () => T): Signal.Computed<T> {
  return new Signal.Computed(fn)
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
    callback(signal.get())
  })
  watcher.watch(signal)
  return watcher
}
