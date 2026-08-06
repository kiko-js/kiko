export { createSignal, isSignal } from "./signal"
export { computed, derived, toSignalValue, watchValue } from "./computed"
export { effect, type EffectCleanup, type EffectFn } from "./effect"
export { createEmitter, Emitter, type EventMap, type Listener } from "./emit"
export { onCleanup, type CleanupFn } from "./scope"
export { batch, untrack } from "./scheduler"
export { on } from "./on"
export { createStore, ref, isRef, REF } from "./store"
export type { Store, PathKey, Ref } from "./store"
export { createResource, type Resource, type ResourceOptions } from "./resource"
import { Signal } from "signal-polyfill"

export type Watcher = Signal.subtle.Watcher

/**
 * Create a watcher that invokes `callback` when any of its watched signals change.
 * Use `watcher.watch(signal)` to add signals; `watcher.unwatch(signal)` to remove.
 */
export function createWatcher(callback: () => void): Watcher {
  return new Signal.subtle.Watcher(callback)
}
