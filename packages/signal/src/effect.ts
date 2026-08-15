import { Signal } from "signal-polyfill"
import { scheduleEffect, untrack } from "./scheduler"
import { flushScope, onCleanup, runInScope, type CleanupFn } from "./scope"
import { reportError } from "./report"

export type EffectCleanup = () => void
/**
 * An effect callback. Any return value is accepted; only a function return is
 * treated as a cleanup and run before the next re-run / on dispose.
 */
export type EffectFn = () => unknown

/**
 * Run `fn` once, then re-run it whenever any signal it read changes. The
 * optional cleanup returned by `fn` (or registered via `onCleanup`) runs
 * before each re-run and on disposal.
 *
 * Re-runs are microtask-batched and deduplicated: N synchronous signal writes
 * produce a single re-run. Errors thrown by `fn` are isolated — they are
 * reported via the host error hook and do not stop sibling effects or future
 * re-runs.
 *
 * Cleanup semantics:
 * - The returned cleanup is registered into the same scope as `onCleanup`
 *   (as the last entry), so both run in one reverse-registration order on
 *   re-run and on dispose — no ordering divergence between the two paths.
 * - Cleanups run inside `untrack`: signal reads in a cleanup never become
 *   effect dependencies.
 * - A throwing cleanup is swallowed (`flushScope`) and does not wedge the
 *   effect — the next run still executes.
 */
export function effect(fn: EffectFn): EffectCleanup {
  const scope: CleanupFn[] = []
  let disposed = false

  const computed = new Signal.Computed(() => {
    // 清理上一轮（含返回式清理）——untrack 执行，避免清理中的信号读取
    // 污染 effect 依赖；flushScope 逐条吞错，不会让 effect 楔死。
    untrack(() => flushScope(scope))
    const result = runInScope(scope, fn)
    // 返回式清理并入 scope：与 onCleanup 同一机制、同一错误策略、同一
    // 顺序（逆序注册），重跑与 dispose 两条路径行为一致。
    if (typeof result === "function") scope.push(result as CleanupFn)
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

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    watcher.unwatch(computed)
    untrack(() => flushScope(scope))
  }
  // Nested effects are owned by the enclosing effect: when the outer effect
  // re-runs or is disposed, automatically dispose effects created during its
  // last run. At top level this is a no-op (no active scope).
  onCleanup(dispose)

  return dispose
}
