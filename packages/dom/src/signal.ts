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
