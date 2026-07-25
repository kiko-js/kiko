import { Signal } from "signal-polyfill"

/**
 * Create a standard `Signal.State<T>` — the TC39 Signals interface provided by
 * signal-polyfill.  Other kiko packages consume only this standard type;
 * they never import from /signal.
 */
export function createSignal<T>(initial: T): Signal.State<T> {
  return new Signal.State(initial)
}

/** Type guard: true for any standard watchable signal (`State` or `Computed`). */
export function isSignal(
  value: unknown,
): value is Signal.State<unknown> | Signal.Computed<unknown> {
  return value instanceof Signal.State || value instanceof Signal.Computed
}
