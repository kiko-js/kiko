import { Signal } from "signal-polyfill"

export const REF = Symbol("ref")
/** Escape hatch for reading the raw store root when a data key collides with the store API. */
export const STORE_RAW = Symbol("kiko.store.raw")

export type PathKey = string | number | symbol

export interface Ref<T> {
  readonly [REF]: true
  readonly value: T
}

type UnwrapRef<T> = T extends Ref<infer U> ? U : T

export type Store<T> = StoreNode<T> &
  (T extends Ref<infer U>
    ? { readonly [K in keyof U]: Store<U[K]> }
    : T extends Array<infer U>
      ? { readonly length: Store<number> } & { readonly [K: number]: Store<U> }
      : T extends object
        ? { readonly [K in keyof T]: Store<T[K]> }
        : unknown)

interface StoreNode<T> {
  get(): UnwrapRef<T>
  set(value: UnwrapRef<T> | T): void
  /** Internal signal for this exact path. Undefined when the node is under a ref. */
  readonly signal: Signal.State<UnwrapRef<T>> | undefined
  /** Raw store root escape hatch for data keys that collide with the store API. */
  readonly [STORE_RAW]: unknown
}

interface SignalEntry<T> {
  path: PathKey[]
  signal: Signal.State<T>
}

interface SignalTrieNode {
  entry?: SignalEntry<unknown>
  children: Map<PathKey, SignalTrieNode>
}

interface StoreContext {
  root: unknown
  signals: SignalTrieNode
  /** Objects already frozen as read-only snapshots by `get()`. */
  frozen: WeakSet<object>
}

export function ref<T>(value: T): Ref<T> {
  return { [REF]: true, value }
}

export function isRef<T>(value: unknown): value is Ref<T> {
  return (
    value !== null && typeof value === "object" && (value as Record<symbol, unknown>)[REF] === true
  )
}

/** Plain objects and arrays are store containers; other objects are treated as opaque terminals. */
function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false
  if (Array.isArray(value)) return true
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function readPath(
  root: unknown,
  path: PathKey[],
): { value: unknown; isRef: boolean; underRef: boolean } {
  let current = root
  let underRef = false
  for (const key of path) {
    if (current === null || current === undefined)
      return { value: undefined, isRef: false, underRef }
    if (isRef(current)) {
      current = current.value
      underRef = true
    } else if (!isPlainObject(current)) {
      // Non-plain objects (Date, Map, class instances) are opaque terminals:
      // reading through them must stay raw and never be signal-tracked.
      underRef = true
    }
    current = (current as Record<PathKey, unknown>)[key]
  }
  if (current !== null && current !== undefined && isRef(current)) {
    return { value: (current as Ref<unknown>).value, isRef: true, underRef }
  }
  return { value: current, isRef: false, underRef }
}

function setValueAtPath(root: unknown, path: PathKey[], value: unknown): unknown {
  if (path.length === 0) {
    return value
  }
  const key = path[0] as PathKey
  const rest = path.slice(1)
  const currentValue =
    root !== null && typeof root === "object" ? (root as Record<PathKey, unknown>)[key] : undefined
  const nextChild = setValueAtPath(currentValue, rest, value)
  if (Object.is(currentValue, nextChild)) {
    return root
  }
  if (Array.isArray(root)) {
    const next = root.slice()
    const idx = typeof key === "number" ? key : Number(key)
    next[idx] = nextChild
    return next
  }
  if (root !== null && typeof root === "object") {
    return { ...root, [key]: nextChild }
  }
  const container: Record<PathKey, unknown> =
    typeof key === "number" ? ([] as unknown as Record<PathKey, unknown>) : {}
  container[key] = nextChild
  return container
}

function deepFreeze<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== "object") return value
  if (isRef(value) || !isPlainObject(value)) return value
  if (seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen)
  }
  return value
}

function getTrieNode(root: SignalTrieNode, path: PathKey[], create: true): SignalTrieNode
function getTrieNode(
  root: SignalTrieNode,
  path: PathKey[],
  create: false,
): SignalTrieNode | undefined
function getTrieNode(
  root: SignalTrieNode,
  path: PathKey[],
  create: boolean,
): SignalTrieNode | undefined {
  let node = root
  for (const key of path) {
    let child = node.children.get(key)
    if (!child) {
      if (!create) return undefined
      child = { children: new Map() }
      node.children.set(key, child)
    }
    node = child
  }
  return node
}

function collectAffected(root: SignalTrieNode, path: PathKey[]): SignalEntry<unknown>[] {
  const affected: SignalEntry<unknown>[] = []
  let node: SignalTrieNode | undefined = root
  for (let i = 0; i <= path.length; i++) {
    if (!node) break
    if (node.entry) affected.push(node.entry)
    if (i < path.length) node = node.children.get(path[i]!)
  }
  if (!node) return affected
  const stack: SignalTrieNode[] = [node]
  while (stack.length > 0) {
    const n = stack.pop()!
    if (n.entry) affected.push(n.entry)
    for (const child of n.children.values()) stack.push(child)
  }
  return affected
}

/**
 * A `Signal.State` whose `.set()` routes back into the store, so writing
 * `store.a.signal.set(5)` (P4) actually mutates the store root and stays in
 * sync with `store.a.set(5)`. The raw set used by `setNodeValue`/pruning goes
 * through the inherited `Signal.State.set` (via `rawSetSignal`) to avoid
 * re-entering `setNodeValue` and looping.
 */
class StoreSignal<T> extends Signal.State<T> {
  private readonly ctx: StoreContext
  private readonly storePath: PathKey[]
  constructor(initial: T, ctx: StoreContext, path: PathKey[]) {
    super(initial)
    this.ctx = ctx
    this.storePath = path
  }
  override set(value: T): void {
    setNodeValue(this.ctx, this.storePath, value)
  }
}

/** Set a signal's value directly, bypassing any `StoreSignal` routing override. */
function rawSetSignal<T>(signal: Signal.State<T>, value: T): void {
  Object.getPrototypeOf(StoreSignal.prototype).set.call(signal, value)
}

/** Stable string key for a path (handles symbol keys, collision-free). */
function pathKey(path: PathKey[]): string {
  return JSON.stringify(path.map(k => (typeof k === "symbol" ? `sym:${k.toString()}` : k)))
}

/** Enumerate every reachable data path from `value` (plain objects/arrays only). */
function enumeratePaths(
  value: unknown,
  prefix: PathKey[],
  out: Set<string>,
  seen: WeakSet<object> = new WeakSet(),
): void {
  out.add(pathKey(prefix))
  if (value === null || typeof value !== "object") return
  if (isRef(value) || !isPlainObject(value)) return // opaque terminal: do not descend
  if (seen.has(value)) return // cycle guard (self-referencing stores)
  seen.add(value)
  for (const key of Reflect.ownKeys(value)) {
    enumeratePaths((value as Record<PropertyKey, unknown>)[key], [...prefix, key], out, seen)
  }
}

/** Drop trie entries (and empty subtrees) for paths no longer reachable from root (S5). */
function pruneTrie(node: SignalTrieNode, prefix: PathKey[], reachable: Set<string>): void {
  if (node.entry && !reachable.has(pathKey(prefix))) {
    node.entry = undefined
  }
  for (const [key, child] of Array.from(node.children.entries())) {
    pruneTrie(child, [...prefix, key], reachable)
    if (!child.entry && child.children.size === 0) {
      node.children.delete(key)
    }
  }
}

function getSignal<T>(context: StoreContext, path: PathKey[]): Signal.State<T> {
  const node = getTrieNode(context.signals, path, true)
  if (!node.entry) {
    const { value } = readPath(context.root, path)
    node.entry = {
      path: path.slice(),
      signal: new StoreSignal(value, context, path.slice()) as Signal.State<unknown>,
    }
  }
  return node.entry.signal as Signal.State<T>
}

function createProxyNode<T>(context: StoreContext, path: PathKey[]): Store<T> {
  // 箭头函数作为 callable target：没有非可配置的 `prototype`，因此 `ownKeys`
  // 可以安全地只返回数据键，`Object.keys(store)` 不会触发 Proxy invariant 错误。
  const node = new Proxy((() => {}) as unknown as StoreNode<T>, {
    get(_target, prop) {
      if (prop === STORE_RAW) {
        return context.root
      }
      if (prop === "get") {
        return (): T => {
          const { value, underRef, isRef } = readPath(context.root, path)
          if (underRef) return value as T
          const current = getSignal<T>(context, path).get()
          if (!isRef && current !== null && typeof current === "object") {
            deepFreeze(current, context.frozen)
          }
          return current
        }
      }
      if (prop === "set") {
        return (value: T): void => {
          const { underRef } = readPath(context.root, path)
          if (underRef) return
          setNodeValue(context, path, value)
        }
      }
      if (prop === "signal") {
        const { underRef } = readPath(context.root, path)
        if (underRef) return undefined
        return getSignal<T>(context, path)
      }
      if (prop === Symbol.toPrimitive) {
        // Honor the coercion hint: "number"/"default" yield a Number for
        // numeric values (so `store.a + 1 === 51`), "string" yields a String.
        return (hint: string): string | number => {
          const value = readPath(context.root, path).value
          if (hint === "string") return String(value)
          const num = Number(value)
          return Number.isNaN(num) ? String(value) : num
        }
      }
      if (prop === "toString" || prop === "valueOf") {
        return () => String(readPath(context.root, path).value)
      }
      // P3: method-style access. A native function on the underlying PLAIN
      // container value — e.g. `store.items.map(fn)` — is bound to a live read of
      // the container so it operates on the CURRENT value instead of silently
      // yielding a detached proxy node. Only when the container is a plain
      // object/array: opaque terminals (Date, class instances) and nested store
      // nodes must keep their proxy-node behavior (so `.set`/`.get` still work).
      if (typeof prop === "string") {
        const container = readPath(context.root, path).value
        if (isPlainObject(container)) {
          const childVal = readPath(context.root, [...path, prop]).value
          if (
            typeof childVal === "function" &&
            (childVal as unknown as Record<symbol, unknown>)[STORE_RAW] === undefined
          ) {
            return (...args: unknown[]): unknown => {
              const live = getSignal(context, path).get() as Record<string, unknown>
              return (live[prop] as (...a: unknown[]) => unknown)(...args)
            }
          }
        }
      }
      // 拒绝内建探测：迭代器 / toStringTag 以及 thenable 协议。代理目标是
      // 可调用函数，未拦截时 `store.then` 返回可调用代理节点 → `await store`
      // 走 thenable 协议永不 resolve（挂起），`isPromiseLike(store)` 也误判为
      // true。用户数据仍可能以 symbol 为 key，必须走代理路径。
      if (
        prop === Symbol.iterator ||
        prop === Symbol.asyncIterator ||
        prop === Symbol.toStringTag ||
        prop === "then" ||
        prop === "catch" ||
        prop === "finally"
      ) {
        return undefined
      }
      return createProxyNode(context, [...path, prop])
    },
    set() {
      return false
    },
    apply() {
      const { value, underRef } = readPath(context.root, path)
      if (underRef) return value
      return getSignal<T>(context, path).get()
    },
    ownKeys() {
      const { value } = readPath(context.root, path)
      if (value === null || value === undefined || typeof value !== "object") return []
      return Reflect.ownKeys(value)
    },
    getOwnPropertyDescriptor(_target, prop) {
      const { value } = readPath(context.root, path)
      if (value === null || value === undefined || typeof value !== "object") return undefined
      const desc = Reflect.getOwnPropertyDescriptor(value, prop)
      if (desc) desc.configurable = true
      return desc
    },
    has(_target, prop) {
      const { value } = readPath(context.root, path)
      if (value === null || value === undefined || typeof value !== "object") return false
      return prop in value
    },
  })
  return node as Store<T>
}

function setNodeValue(context: StoreContext, path: PathKey[], value: unknown): void {
  const { underRef } = readPath(context.root, path)
  if (underRef) return
  const nextRoot = setValueAtPath(context.root, path, value)
  if (Object.is(context.root, nextRoot)) return
  context.root = nextRoot
  for (const entry of collectAffected(context.signals, path)) {
    // raw set (not StoreSignal.set) so this does not re-enter setNodeValue
    rawSetSignal(entry.signal as Signal.State<unknown>, readPath(context.root, entry.path).value)
  }
  // S5: drop trie entries whose path is no longer reachable from the new root
  // (e.g. a dropped dynamic key like `store.byId[id]`) so their signals can be
  // reclaimed instead of leaking for the store's lifetime.
  const reachable = new Set<string>()
  enumeratePaths(context.root, [], reachable)
  pruneTrie(context.signals, [], reachable)
}

export function createStore<T>(initialState: T): Store<T> {
  const context: StoreContext = {
    root: initialState,
    signals: { children: new Map() },
    frozen: new WeakSet(),
  }
  return createProxyNode<T>(context, [])
}
