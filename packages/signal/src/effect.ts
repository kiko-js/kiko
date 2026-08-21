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
    // 清理上一轮：必须在 activeConsumer 之外、且 untrack，避免在
    // producerRecomputeValue / consumerAfterComputation 持有 activeConsumer
    // 期间调用 watcher.unwatch（嵌套 effect 的 dispose）导致 liveConsumer
    // 链表在迭代中被并发修改，偶发触发 signal-polyfill 的
    // producerRemoveLiveConsumerAtIndex 空洞断言（线上 R9 偶发）。
    untrack(() => flushScope(scope))
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
