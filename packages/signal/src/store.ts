import { Signal } from "signal-polyfill"
import { batch } from "./scheduler"

/**
 * Fine-grained reactive store: each property is backed by an independent
 * `Signal.State`, with nested objects recursively wrapped as nested stores.
 *
 * ```ts
 * const [store, setStore] = createStore({ name: "Alice", age: 30 })
 *
 * // Read like a plain object — subscribes to just the accessed properties
 * effect(() => console.log(store.name, store.age))
 *
 * // Partial update — only "name" watchers fire, "age" is undisturbed
 * setStore({ name: "Bob" })
 *
 * // Immer-style producer — only changed properties trigger watchers
 * setStore(draft => { draft.age += 1 })
 * ```
 */

const $signals = Symbol("$signals")

type SignalMap = Map<string | symbol, Signal.State<unknown>>

interface StoreNode {
  [$signals]: SignalMap
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function isStoreNode(v: unknown): v is StoreNode {
  return v !== null && typeof v === "object" && $signals in v
}

/**
 * Recursively create a proxy store node. Each property of `initial` becomes
 * a `Signal.State`. Nested plain objects become nested store nodes so that
 * `store.user.name` subscribes independently from `store.user.age`.
 */
function createNode(initial: Record<string, unknown>): StoreNode {
  const signals: SignalMap = new Map()

  for (const [key, value] of Object.entries(initial)) {
    if (isPlainObject(value)) {
      signals.set(key, new Signal.State(createNode(value)))
    } else {
      signals.set(key, new Signal.State(value))
    }
  }

  const target = { [$signals]: signals } as StoreNode

  return new Proxy(target, {
    get(_target, prop, _receiver) {
      if (prop === $signals) return signals
      const s = signals.get(prop)
      if (s !== undefined) return s.get()
      return undefined
    },

    set(_target, prop, _value) {
      throw new Error(
        `Cannot assign to "${String(prop)}" on a store. Use setStore() to update.`,
      )
    },

    deleteProperty(_target, prop) {
      throw new Error(
        `Cannot delete "${String(prop)}" on a store. Use setStore() to update.`,
      )
    },

    ownKeys(_target) {
      return Array.from(signals.keys())
    },

    getOwnPropertyDescriptor(_target, prop) {
      if (signals.has(prop as string)) {
        return { enumerable: true, configurable: true }
      }
      return undefined
    },

    has(_target, prop) {
      return prop === $signals || signals.has(prop as string)
    },
  }) as unknown as StoreNode
}

// ── snapshot / diff / merge ──────────────────────────────────────────

/** Deep snapshot: recursively extract plain values from a store node. */
function snapshot(node: StoreNode): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, s] of node[$signals]) {
    const val = s.get()
    result[key as string] = isStoreNode(val) ? snapshot(val) : val
  }
  return result
}

/**
 * Apply a diff between `draft` (plain object) and the current store state.
 * Only properties whose value actually changed are written to their signals.
 * Keys not in the draft are deleted from the store.
 */
function applyDiff(node: StoreNode, draft: Record<string, unknown>): void {
  const signals = node[$signals]

  for (const [key, value] of Object.entries(draft)) {
    const existing = signals.get(key)
    const current = existing?.get()

    if (isStoreNode(current) && isPlainObject(value)) {
      applyDiff(current, value)
    } else if (existing) {
      if (current !== value) existing.set(value)
    } else {
      signals.set(
        key,
        new Signal.State(isPlainObject(value) ? createNode(value) : value),
      )
    }
  }

  for (const key of signals.keys()) {
    if (!(key as string in draft)) signals.delete(key)
  }
}

/**
 * Deep-merge `partial` into a store node. Existing nested stores are
 * recursively merged; new keys auto-create signals; existing primitives
 * are replaced. Keys not mentioned in `partial` are left alone.
 */
function deepMerge(node: StoreNode, partial: Record<string, unknown>): void {
  const signals = node[$signals]

  for (const [key, value] of Object.entries(partial)) {
    const existing = signals.get(key)
    const current = existing?.get()

    if (isStoreNode(current) && isPlainObject(value)) {
      deepMerge(current, value)
    } else if (existing) {
      existing.set(isPlainObject(value) ? createNode(value) : value)
    } else {
      signals.set(
        key,
        new Signal.State(isPlainObject(value) ? createNode(value) : value),
      )
    }
  }
}

// ── public API ───────────────────────────────────────────────────────

export type SetStoreFn<T> = (recipe: Partial<T> | ((draft: T) => void)) => void

/**
 * Create a fine-grained reactive store.
 *
 * Returns a tuple `[store, setStore]`:
 * - `store` — a Proxy that reads like a plain object. Each property access
 *   subscribes the active consumer to that property's signal.
 * - `setStore` — the mutation API. Accepts either a partial object (shallow
 *   merge) or a function receiving a mutable draft (Immer-style). Both run
 *   inside a `batch`. Nested objects are auto-wrapped as nested stores.
 */
export function createStore<T extends Record<string, unknown>>(
  initial: T,
): [T, SetStoreFn<T>] {
  const root = createNode(initial)

  function setStore(recipe: Partial<T> | ((draft: T) => void)): void {
    batch(() => {
      if (typeof recipe === "function") {
        const draft = snapshot(root) as T
        ;(recipe as (draft: T) => void)(draft)
        applyDiff(root, draft as Record<string, unknown>)
      } else {
        deepMerge(root, recipe as Record<string, unknown>)
      }
    })
  }

  return [root as unknown as T, setStore]
}
