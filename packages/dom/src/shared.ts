import { isSignal } from "./signal"
import type { WatchableSignal } from "./signal"

/**
 * Value-shape helpers shared by the DOM runtime paths (client jsx-runtime,
 * flow control, hydration, SSR). Pure functions — no DOM access.
 */

/** True for any thenable (native promise or a `{ then }` object). */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function"
}

/** SolidJS-style truthiness: `false`, nullish, `""` and `0` are falsy. */
export function isTruthy(cond: unknown): boolean {
  return cond !== false && cond != null && cond !== "" && cond !== 0
}

/** Read a value that may be a signal; plain values pass through. */
export function unwrap<T>(value: T | WatchableSignal<T>): T {
  return isSignal(value) ? (value as WatchableSignal<T>).get() : (value as T)
}

/** Recursively stringify style children: signals resolve to their current
 * snapshot, arrays flatten, everything else becomes `String(value)`. */
export function extractCssText(children: unknown): string {
  const parts: string[] = []
  const visit = (value: unknown): void => {
    if (value == null || value === false || value === true) return
    if (isSignal(value)) {
      visit((value as WatchableSignal<unknown>).get())
      return
    }
    if (Array.isArray(value)) {
      for (const c of value) visit(c)
      return
    }
    parts.push(String(value))
  }
  visit(children)
  return parts.join("\n")
}
