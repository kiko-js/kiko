import { Signal } from "signal-polyfill"

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
let flushDepth = 0
const MAX_FLUSH_DEPTH = 100

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
    flushDepth = 0
    return
  }
  // Safety net for circular effect dependencies: each round that re-schedules
  // work advances the depth, so a pathological cycle is stopped instead of
  // queueing microtasks forever. Normal flows drain `pendingEffects` and reset.
  if (flushDepth > MAX_FLUSH_DEPTH) {
    pendingEffects = new Set()
    flushDepth = 0
    console.error("Circular dependency detected in effects")
    return
  }
  flushDepth++
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
  if (pendingEffects.size === 0) flushDepth = 0
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
