import { Signal } from "signal-polyfill"
import { reportError } from "./report"

/**
 * Microtask-batched effect scheduler shared by `effect()` and the DOM runtime.
 *
 * `scheduleEffect(run)` deduplicates `run`: it runs at most once per microtask,
 * even if many signals are set synchronously. `batch(fn)` defers the flush until
 * the outermost batch exits, so N signal writes inside it produce a single run
 * per scheduled effect.
 *
 * `Signal.subtle.untrack` is reached via bracket access (`subtle["untrack"]`)
 * because some bundlers/test runners lexically shadow the bare `untrack`
 * identifier; bracket access is immune to that and is semantically identical.
 */

type EffectRun = () => void

const untrackFn: <U>(cb: () => U) => U = Signal.subtle["untrack"]

let batchDepth = 0
let flushScheduled = false
let pendingEffects: Set<EffectRun> = new Set()
// 逐 effect 的循环预算：同一 flush 级联内（pending 持续非空）每个 run 累计的
// 重排轮数。连续重排超限的 run 被单独丢弃——不再像旧实现那样用全局深度
// 清空全部待跑 effect（会误伤级联期间由外部写入调度进来的无关 effect）。
const MAX_RESCHEDULE_ROUNDS = 100
let rescheduleRounds = new Map<EffectRun, number>()

/** Enqueue `run` for the next flush. Idempotent within a flush cycle. */
export function scheduleEffect(run: EffectRun): void {
  pendingEffects.add(run)
  if (batchDepth > 0) return
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(flushEffects)
}

function flushEffects(): void {
  flushScheduled = false
  if (pendingEffects.size === 0) {
    rescheduleRounds.clear()
    return
  }
  // 丢弃连续重排超限的 run（循环参与者）；其余排队 effect 不受影响。
  for (const [run, rounds] of rescheduleRounds) {
    if (rounds > MAX_RESCHEDULE_ROUNDS) {
      pendingEffects.delete(run)
      rescheduleRounds.delete(run)
      reportError(new Error("Circular dependency detected in effects"))
    }
  }
  if (pendingEffects.size === 0) {
    rescheduleRounds.clear()
    return
  }
  const effects = pendingEffects
  pendingEffects = new Set()
  for (const run of effects) {
    try {
      run()
    } catch (err) {
      // Isolate: one effect throwing must not stop sibling effects or break
      // the scheduler. Surface via the host error hook, not a rethrow.
      reportError(err)
    }
  }
  if (pendingEffects.size === 0) {
    rescheduleRounds.clear()
    return
  }
  // 统计重排：本轮执行后仍在排队的 run 又调度了一次。轮数在同一级联内
  // 累计（自循环/交替循环都会持续增长），级联结束后整体清零。
  const next = new Map<EffectRun, number>()
  for (const [run, rounds] of rescheduleRounds) {
    next.set(run, pendingEffects.has(run) ? rounds + 1 : rounds)
  }
  for (const run of pendingEffects) {
    if (!next.has(run)) next.set(run, 1)
  }
  rescheduleRounds = next
}

/**
 * Run `fn` with effect flushing deferred until it returns. Multiple signal
 * writes inside `fn` produce a single effect run per scheduled effect.
 * Nestable; only the outermost batch triggers the flush.
 */
export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && !flushScheduled && pendingEffects.size > 0) {
      flushScheduled = true
      queueMicrotask(flushEffects)
    }
  }
}

/** Read signals inside `fn` without subscribing the current consumer. */
export function untrack<T>(fn: () => T): T {
  return untrackFn(fn)
}
