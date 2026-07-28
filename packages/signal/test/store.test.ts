import { describe, it, expect } from "bun:test"
import { Signal } from "signal-polyfill"
import { createStore, computed } from "../src"

describe("createStore", () => {
  // ── basic reads ────────────────────────────────────────────────────

  it("returns a tuple [store, setStore]", () => {
    const [store, setStore] = createStore({ x: 1 })
    expect(store.x).toBe(1)
    expect(typeof setStore).toBe("function")
  })

  it("store reads like a plain object", () => {
    const [store] = createStore({ name: "Alice", age: 30 })
    expect(store.name).toBe("Alice")
    expect(store.age).toBe(30)
  })

  it("direct assignment to store throws", () => {
    const [store] = createStore({ name: "Alice" })
    expect(() => {
      ;(store as Record<string, unknown>).name = "Bob"
    }).toThrow()
  })

  it("direct delete on store throws", () => {
    const [store] = createStore({ name: "Alice" })
    expect(() => {
      delete (store as Record<string, unknown>).name
    }).toThrow()
  })

  it("Object.keys iterates property names", () => {
    const [store] = createStore({ a: 1, b: 2 })
    const keys = Object.keys(store)
    expect(keys).toContain("a")
    expect(keys).toContain("b")
    expect(keys.length).toBe(2)
  })

  // ── setStore partial ───────────────────────────────────────────────

  it("setStore partial updates a single property", () => {
    const [store, setStore] = createStore({ name: "Alice", age: 30 })
    setStore({ name: "Bob" })
    expect(store.name).toBe("Bob")
    expect(store.age).toBe(30)
  })

  it("setStore partial updates multiple properties", () => {
    const [store, setStore] = createStore({ x: 0, y: 0, z: 0 })
    setStore({ x: 1, y: 2 })
    expect(store.x).toBe(1)
    expect(store.y).toBe(2)
    expect(store.z).toBe(0)
  })

  it("setStore partial auto-creates signals for new keys", () => {
    const [store, setStore] = createStore({ a: 1 })
    setStore({ b: 2 })
    expect(store.a).toBe(1)
    expect((store as Record<string, unknown>).b).toBe(2)
  })

  it("setStore partial with nested object auto-creates nested store", () => {
    const [store, setStore] = createStore<Record<string, unknown>>({ a: 1 })
    setStore({ nested: { x: 10 } })
    const nested = (store as Record<string, unknown>).nested as Record<string, unknown>
    expect(nested.x).toBe(10)
    // nested should also be reactive (proxy)
    setStore({ nested: { x: 20 } })
    expect(nested.x).toBe(20)
  })

  // ── setStore function (immer-like) ─────────────────────────────────

  it("setStore function mutates draft and applies changes", () => {
    const [store, setStore] = createStore({ x: 0, y: 0 })
    setStore(draft => {
      draft.x = 5
      draft.y = 10
    })
    expect(store.x).toBe(5)
    expect(store.y).toBe(10)
  })

  it("setStore function only triggers watchers for changed properties", () => {
    const [store, setStore] = createStore({ name: "Alice", age: 30 })

    let ageRuns = 0
    const w = new Signal.subtle.Watcher(() => { ageRuns++ })
    // We can't easily watch a proxy property directly — use the internal
    // signal mechanism via a computed that reads the property
    const ageComputed = computed(() => store.age)
    w.watch(ageComputed)
    ageComputed.get() // prime

    setStore(draft => {
      draft.age = 31
      // name stays "Alice" — unchanged
    })

    expect(ageRuns).toBe(1)
  })

  it("setStore function can add new properties", () => {
    const [store, setStore] = createStore<Record<string, unknown>>({ a: 1 })
    setStore(draft => {
      ;(draft as Record<string, unknown>).b = 2
    })
    expect(store.a).toBe(1)
    expect((store as Record<string, unknown>).b).toBe(2)
  })

  it("setStore function can delete properties", () => {
    const [store, setStore] = createStore<Record<string, unknown>>({ a: 1, b: 2 })
    setStore(draft => {
      delete (draft as Record<string, unknown>).b
    })
    expect(store.a).toBe(1)
    expect((store as Record<string, unknown>).b).toBeUndefined()
  })

  // ── fine-grained reactivity ────────────────────────────────────────

  it("computed subscribes only to properties it reads", () => {
    const [store, setStore] = createStore({ a: 1, b: 2, c: 3 })

    let runs = 0
    const sum = computed(() => {
      runs++
      return (store.a as number) + (store.b as number)
    })

    expect(sum.get()).toBe(3)
    expect(runs).toBe(1)

    // Change a watched property
    setStore({ a: 10 })
    expect(sum.get()).toBe(12)
    expect(runs).toBe(2)

    // Change an unwatched property — should NOT re-evaluate
    setStore({ c: 99 })
    expect(sum.get()).toBe(12)
    expect(runs).toBe(2)
  })

  it("watcher on a single property only fires when that property changes", () => {
    const [store, setStore] = createStore({ name: "Alice", age: 30 })

    let nameRuns = 0
    let ageRuns = 0

    // Create computeds that each read a single property
    const nameC = computed(() => { nameRuns++; return store.name })
    const ageC = computed(() => { ageRuns++; return store.age })

    // Prime them under watchers
    const nameW = new Signal.subtle.Watcher(() => {})
    const ageW = new Signal.subtle.Watcher(() => {})
    nameW.watch(nameC)
    ageW.watch(ageC)
    nameC.get()
    ageC.get()

    // Reset counters (the initial .get() incremented them)
    nameRuns = 0
    ageRuns = 0

    setStore({ name: "Bob" })

    // Computed is lazy — trigger re-evaluation
    nameC.get()
    ageC.get()

    // name computed should re-evaluate, age should not
    expect(nameRuns).toBe(1)
    expect(ageRuns).toBe(0)
  })

  // ── nested stores ──────────────────────────────────────────────────

  it("nested objects are wrapped as reactive stores", () => {
    const [store, setStore] = createStore({
      user: { name: "Alice", age: 30 },
    })

    expect(store.user.name).toBe("Alice")
    expect(store.user.age).toBe(30)
  })

  it("nested store updates are fine-grained", () => {
    const [store, setStore] = createStore({
      user: { name: "Alice", age: 30 },
    })

    let nameRuns = 0
    let ageRuns = 0

    const nameC = computed(() => { nameRuns++; return store.user.name })
    const ageC = computed(() => { ageRuns++; return store.user.age })

    const nameW = new Signal.subtle.Watcher(() => {})
    const ageW = new Signal.subtle.Watcher(() => {})
    nameW.watch(nameC)
    ageW.watch(ageC)
    nameC.get()
    ageC.get()

    nameRuns = 0
    ageRuns = 0

    // Update only name — age watcher should not fire
    setStore({ user: { name: "Bob" } })

    // Computed is lazy — trigger re-evaluation
    nameC.get()
    ageC.get()

    expect(nameRuns).toBe(1)
    expect(ageRuns).toBe(0)
    expect(store.user.name).toBe("Bob")
    expect(store.user.age).toBe(30)
  })

  it("setStore function with nested draft", () => {
    const [store, setStore] = createStore({
      user: { name: "Alice", age: 30 },
    })

    setStore(draft => {
      draft.user.name = "Bob"
    })

    expect(store.user.name).toBe("Bob")
    expect(store.user.age).toBe(30)
  })

  it("deeply nested stores work", () => {
    const [store, setStore] = createStore({
      a: { b: { c: 1 } },
    })

    expect(store.a.b.c).toBe(1)

    let runs = 0
    const c = computed(() => { runs++; return store.a.b.c as number })

    const w = new Signal.subtle.Watcher(() => {})
    w.watch(c)
    c.get()
    runs = 0

    setStore({ a: { b: { c: 2 } } })

    // Computed is lazy — trigger re-evaluation
    c.get()

    expect(runs).toBe(1)
    expect(store.a.b.c).toBe(2)
  })

  // ── edge cases ─────────────────────────────────────────────────────

  it("empty object", () => {
    const [store, setStore] = createStore({})
    expect(Object.keys(store).length).toBe(0)
    setStore({ x: 1 })
    expect((store as Record<string, unknown>).x).toBe(1)
  })

  it("arrays are stored as plain values (not deeply wrapped)", () => {
    const [store, setStore] = createStore({ items: [1, 2, 3] })
    expect(Array.isArray(store.items)).toBe(true)
    expect(store.items).toEqual([1, 2, 3])

    setStore({ items: [4, 5] })
    expect(store.items).toEqual([4, 5])
  })

  it("null / undefined values", () => {
    const [store, setStore] = createStore<Record<string, unknown>>({
      a: null,
      b: undefined,
    })
    expect(store.a).toBeNull()
    expect(store.b).toBeUndefined()

    setStore({ a: "hello", b: 42 })
    expect(store.a).toBe("hello")
    expect(store.b).toBe(42)
  })
})
