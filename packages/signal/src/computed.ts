import { Signal } from "signal-polyfill"
import { isSignal } from "./signal"
import { reportError } from "./report"
import { runWithoutScope } from "./scope"

/**
 * User-facing `computed()` values are read-only: writing inside them is almost
 * always a bug. signal-polyfill enables writes for every Computed, so we opt
 * each kiko `computed()` into signal-polyfill's native "no writes" context by
 * flipping that computed's internal consumer node flag.
 *
 * This is scoped to exactly the computeds created through this module (internal
 * `new Signal.Computed` users, such as `effect()` and control flow, are
 * unaffected) — and, unlike a global `Signal.State.prototype.set` monkey-patch,
 * it never mutates a shared prototype. Other TC39 Signal implementations and
 * the dual-package copies bundled by `@kikojs/dom` are left completely alone.
 */
const WRITE_GUARD_MESSAGE = "Signal writes are not allowed inside a computed"

/**
 * Forbid signal writes while this `computed()`'s body runs.
 *
 * signal-polyfill stores each wrapper's reactive node behind a module-private
 * symbol; it consults `consumerAllowSignalWrites` on that node to decide whether
 * a write is permitted ([graph.ts]`producerUpdatesAllowed()`). We locate the node
 * by scanning the wrapper's own symbols — it is the only one that exposes a
 * `consumerAllowSignalWrites` field — and disable writes on it. If the node
 * cannot be located (e.g. a future polyfill layout), we bail out gracefully and
 * keep the default write-allowed behaviour rather than altering global state.
 */
function disallowSignalWrites(computed: Signal.Computed<unknown>): void {
  for (const sym of Object.getOwnPropertySymbols(computed)) {
    const node = (computed as unknown as Record<PropertyKey, unknown>)[sym] as
      | { consumerAllowSignalWrites?: boolean }
      | undefined
    if (node !== null && typeof node === "object" && "consumerAllowSignalWrites" in node) {
      node.consumerAllowSignalWrites = false
      return
    }
  }
}

/**
 * Create a standard `Signal.Computed<T>` — the TC39 Signals interface.
 * Other kiko packages consume only this standard type.
 */
export function computed<T>(fn: () => T): Signal.Computed<T> {
  const computedSignal = new Signal.Computed(() => {
    try {
      return runWithoutScope(fn)
    } catch (err) {
      // The native write guard throws a bare `Error()` with no message; relay
      // it as the actionable kiko message (keeping the original as `cause`).
      // Any other error passes through untouched.
      if (err instanceof Error && err.message === "") {
        throw new Error(WRITE_GUARD_MESSAGE, { cause: err })
      }
      throw err
    }
  })
  disallowSignalWrites(computedSignal)
  return computedSignal
}

/** Alias for `computed`. */
export function derived<T>(fn: () => T): Signal.Computed<T> {
  return computed(fn)
}

/** Unwrap a value that may be a signal; plain values pass through. */
export function toSignalValue<T>(value: T | Signal.State<T> | Signal.Computed<T>): T {
  if (isSignal(value)) return value.get() as T
  return value as T
}

/**
 * Watch a signal (or plain value) and invoke `callback` on change.
 * For non-signal values the callback fires immediately and `null` is returned.
 * Returns a `Signal.subtle.Watcher` the caller is responsible for managing.
 *
 * Signal callbacks run on a microtask: `signal-polyfill` invokes watcher
 * callbacks synchronously inside the notification phase, where reading the
 * signal throws ("signal read during notification phase"). The microtask
 * defers the read until after the phase ends; the watcher is re-armed after
 * each callback (signal-polyfill watchers are one-shot).
 */
export function watchValue<T>(
  value: T | Signal.State<T> | Signal.Computed<T>,
  callback: (value: T) => void,
): Signal.subtle.Watcher | null {
  if (!isSignal(value)) {
    callback(value as T)
    return null
  }

  const signal = value as Signal.State<T> | Signal.Computed<T>
  const watcher = new Signal.subtle.Watcher(() => {
    queueMicrotask(() => {
      // 回调抛错不得让 one-shot watcher 永久失效：错误上报后仍在
      // finally 中 re-arm，后续更新照常送达。
      try {
        callback(signal.get())
      } catch (err) {
        reportError(err)
      } finally {
        watcher.watch(signal)
      }
    })
  })
  watcher.watch(signal)
  return watcher
}
