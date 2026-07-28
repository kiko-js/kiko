import { Signal } from "signal-polyfill"

/**
 * A `Signal.State` subclass whose `.set()` automatically wraps plain objects
 * as nested store nodes, so `store.user.set({ name: "Bob" })` creates a
 * reactive nested store instead of storing a plain object.
 */
class StoreSignal<T> extends Signal.State<T> {
  override set(value: T): void {
    if (isPlainObject(value)) {
      super.set(createNode(value as Record<string, unknown>) as unknown as T)
    } else {
      super.set(value)
    }
  }
}

/**
 * Fine-grained reactive store: each property is a `StoreSignal` (which is
 * a `Signal.State`). Nested plain objects are recursively wrapped as nested
 * stores, so `store.user.get().name` is also a signal.
 *
 * ```ts
 * const store = createStore({ name: "Alice", user: { age: 30 } })
 *
 * // Every property is a Signal.State — read/write via .get() / .set()
 * store.name.get()               // "Alice"
 * store.name.set("Bob")          // only "name" watchers fire
 *
 * // Nested stores: store.user.get() returns the nested store proxy
 * store.user.get().age.get()     // 30
 * store.user.get().age.set(31)   // only user.age watchers fire
 *
 * // .set() auto-wraps plain objects as nested stores
 * const s = createStore({ data: null as unknown })
 * ;(s.data as StoreSignal<unknown>).set({ x: 1 })  // becomes nested store
 *
 * // In JSX, signals are auto-detected (instanceof Signal.State):
 * //   <div>{store.name}</div>   — subscribes to name, updates on change
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

/** Objects currently being wrapped — used to detect circular references. */
const wrapping = new WeakSet<object>()

/**
 * Wrap a value for storage in a signal. Plain objects become nested store
 * nodes; everything else passes through.
 */
function wrap(value: unknown): unknown {
  return isPlainObject(value) ? createNode(value as Record<string, unknown>) : value
}

/**
 * Recursively create a proxy store node. Each property of `initial` is
 * backed by a `StoreSignal`. Nested plain objects become nested store nodes.
 *
 * Throws `TypeError` if a circular reference is detected.
 */
function createNode(initial: Record<string, unknown>): StoreNode {
  if (wrapping.has(initial)) {
    throw new TypeError("Circular reference detected in store")
  }
  wrapping.add(initial)

  try {
    const signals: SignalMap = new Map()

    for (const [key, value] of Object.entries(initial)) {
      signals.set(key, new StoreSignal(wrap(value)))
    }

    const target = { [$signals]: signals } as StoreNode

    const proxy = new Proxy(target, {
      get(_target, prop, _receiver) {
        if (prop === $signals) return signals
        const s = signals.get(prop)
        if (s !== undefined) return s
        return undefined
      },

      set(_target, prop, value, _receiver) {
        if (prop === $signals) return false
        const key = prop as string
        const existing = signals.get(key)
        if (existing) {
          existing.set(value)
        } else {
          signals.set(key, new StoreSignal(wrap(value)))
        }
        return true
      },

      deleteProperty(_target, prop) {
        if (prop === $signals) return false
        return signals.delete(prop as string)
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

    return proxy
  } finally {
    wrapping.delete(initial)
  }
}

/**
 * Create a fine-grained reactive store. Returns a proxy where every
 * property is a `StoreSignal` (subclass of `Signal.State`).
 *
 * - Read: `store.name.get()`, `store.user.get().age.get()`
 * - Write: `store.name.set("Bob")`, `store.user.get().age.set(31)`
 * - `.set()` auto-wraps plain objects as nested stores
 * - JSX auto-detects signals via `instanceof Signal.State`
 */
export function createStore<T extends Record<string, unknown>>(initial: T): T {
  return createNode(initial) as unknown as T
}
