/**
 * Per-effect cleanup scope.
 *
 * `effect()` establishes a scope while its callback runs; `onCleanup(fn)`
 * registers `fn` into the currently active scope. Cleanups run in reverse
 * registration order before the next effect run and on disposal.
 */

export type CleanupFn = () => void

let currentScope: CleanupFn[] | null = null

/**
 * Register a cleanup callback for the currently running effect.
 * No-op when called outside an effect scope.
 */
export function onCleanup(fn: CleanupFn): void {
  if (currentScope !== null) currentScope.push(fn)
}

/**
 * Run `fn` with `scope` as the active cleanup scope, returning whatever `fn`
 * returns. Restores the previous scope on exit. Used by `effect()`.
 */
export function runInScope<T>(scope: CleanupFn[], fn: () => T): T {
  const prev = currentScope
  currentScope = scope
  try {
    return fn()
  } finally {
    currentScope = prev
  }
}

/** Run all cleanups in `scope` (reverse order), clearing the scope. Swallows errors. */
export function flushScope(scope: CleanupFn[]): void {
  while (scope.length > 0) {
    const fn = scope.pop()!
    try {
      fn()
    } catch {
      // A single cleanup failure must not abort the rest.
    }
  }
}
