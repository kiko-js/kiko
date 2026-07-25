import { Signal } from "signal-polyfill"
import { scheduleEffect } from "./scheduler"
import { flushScope, runInScope, type CleanupFn } from "./scope"

export type EffectCleanup = () => void
export type EffectFn = () => void | EffectCleanup

/**
 * Run `fn` once, then re-run it whenever any signal it read changes. The
 * optional cleanup returned by `fn` (or registered via `onCleanup`) runs
 * before each re-run and on disposal.
 *
 * Re-runs are microtask-batched and deduplicated: N synchronous signal writes
 * produce a single re-run. Errors thrown by `fn` are isolated — they are
 * reported via the host error hook and do not stop sibling effects or future
 * re-runs.
 */
export function effect(fn: EffectFn): EffectCleanup {
  let cleanup: void | EffectCleanup
  const scope: CleanupFn[] = []
  let disposed = false

  const computed = new Signal.Computed(() => {
    if (cleanup) {
      cleanup()
      cleanup = undefined
    }
    flushScope(scope)
    cleanup = runInScope(scope, fn)
  })

  const watcher = new Signal.subtle.Watcher(() => {
    if (disposed) return
    scheduleEffect(runEffect)
  })

  function runEffect(): void {
    if (disposed) return
    // Re-reading the computed re-tracks dependencies under the watcher.
    try {
      computed.get()
    } catch (err) {
      reportError(err)
    }
    watcher.watch(computed)
  }

  runEffect()

  return () => {
    if (disposed) return
    disposed = true
    watcher.unwatch(computed)
    flushScope(scope)
    if (cleanup) {
      cleanup()
      cleanup = undefined
    }
  }
}
