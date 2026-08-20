import { Signal } from "signal-polyfill"

/**
 * Create a standard `Signal.State<T>` — the TC39 Signals interface provided by
 * signal-polyfill.  Other kiko packages consume only this standard type;
 * they never import from /signal.
 */
export function createSignal<T>(initial: T): Signal.State<T> {
  return new Signal.State(initial)
}

/**
 * Type guard: true for any standard watchable signal (`State` or `Computed`).
 *
 * Uses duck-typing (constructor-name + accessor shape) instead of `instanceof`
 * so a signal created by a *different* copy of `signal-polyfill` (the
 * dual-package hazard when `@kikojs/signal` and `@kikojs/dom` bundle separate
 * copies) is still recognised. `State` exposes `get`+`set`, `Computed` exposes
 * `get` only; both are named "State"/"Computed" identically across copies.
 * kiko store proxy nodes are callable proxies (typeof "function") and are
 * therefore excluded by the typeof guard before any shape check runs.
 */
export function isSignal(
  value: unknown,
): value is Signal.State<unknown> | Signal.Computed<unknown> {
  if (value === null || typeof value !== "object") return false
  const v = value as Record<PropertyKey, unknown>
  if (typeof v.get !== "function") return false
  const ctor = (value as { constructor?: { name?: string } }).constructor
  const name = ctor?.name
  if (name === "State" || name === "Computed") return true
  // Generic fallback: any get+set accessor object is treated as a State-like signal.
  return typeof v.set === "function"
}
