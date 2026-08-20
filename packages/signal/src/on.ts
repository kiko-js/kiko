import type { EffectCleanup, EffectFn } from "./effect"
import { untrack } from "./scheduler"

/**
 * Explicit-dependency helper for `effect()`.
 *
 * `effect(on(deps, fn))` runs `fn` only when `deps` change (and once on first
 * run, unless `defer: true`). `fn` receives the previous dependency value(s):
 * a single `T` when `deps` is a single getter, or `T[]` when `deps` is an
 * array of getters. `undefined` on the first run.
 *
 * The returned function tracks the declared deps (so the effect re-runs on
 * their change) and nothing else read inside `fn` — `fn` runs untracked,
 * matching SolidJS `on` semantics.
 */
export function on<T>(
  deps: () => T,
  fn: (prev: T | undefined) => void | EffectCleanup,
  options?: { defer?: boolean },
): EffectFn
export function on<T>(
  deps: Array<() => T>,
  fn: (prev: T[] | undefined) => void | EffectCleanup,
  options?: { defer?: boolean },
): EffectFn
export function on<T>(
  deps: (() => T) | Array<() => T>,
  fn: (prev: T | T[] | undefined) => void | EffectCleanup,
  options?: { defer?: boolean },
): EffectFn {
  const defer = options?.defer ?? false
  let prev: T | T[] | undefined
  let first = true

  // Single-dependency (non-array) fast path: no array allocation per run.
  if (!Array.isArray(deps)) {
    const get = deps
    return (() => {
      const input = get()
      if (first && defer) {
        prev = input
        first = false
        return undefined
      }
      const result = untrack(() => fn(prev)) as void | EffectCleanup
      prev = input
      first = false
      return result
    }) as EffectFn
  }

  const depArr = deps
  return (() => {
    const inputs = depArr.map(d => d())
    const input: T[] = inputs

    if (first && defer) {
      prev = input
      first = false
      return undefined
    }

    const result = untrack(() => fn(prev)) as void | EffectCleanup
    prev = input
    first = false
    return result
  }) as EffectFn
}
