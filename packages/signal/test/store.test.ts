import { describe, it, expect } from "bun:test"
import { Signal } from "signal-polyfill"
import { createStore, computed } from "../src"

describe("createStore", () => {
  // ── basic signal API ───────────────────────────────────────────────

  it("returns a store proxy whose properties are Signal.State", () => {
    const store = createStore({ x: 1 })
    expect(store.x instanceof Signal.State).toBe(true)
    expect(store.x.get()).toBe(1)
  })

  it("properties have .get() and .set()", () => {
    const store = createStore({ name: "Alice", age: 30 })
    expect(store.name.get()).toBe("Alice")
    expect(store.age.get()).toBe(30)

    store.name.set("Bob")
    expect(store.name.get()).toBe("Bob")
    expect(store.age.get()).toBe(30)
  })

  it(".set() triggers only watchers on that property", () => {
    const store = createStore({ name: "Alice", age: 30 })

    let nameRuns = 0
    let ageRuns = 0
    const nameC = computed(() => { nameRuns++; return store.name.get() })
    const ageC = computed(() => { ageRuns++; return store.age.get() })
    const nw = new Signal.subtle.Watcher(() => {})
    const aw = new Signal.subtle.Watcher(() => {})
    nw.watch(nameC)
    aw.watch(ageC)
    nameC.get()
    ageC.get()
    nameRuns = 0
    ageRuns = 0

    store.name.set("Bob")
    nameC.get()
    ageC.get()
    expect(nameRuns).toBe(1)
    expect(ageRuns).toBe(0)
  })

  it(".set() auto-wraps plain objects as nested stores", () => {
    const store = createStore<Record<string, unknown>>({ data: null })
    ;(store.data as Signal.State<unknown>).set({ x: 1, y: 2 })
    const nested = store.data.get() as Record<string, unknown>
    expect(nested.x instanceof Signal.State).toBe(true)
    expect((nested.x as Signal.State<unknown>).get()).toBe(1)
    expect((nested.y as Signal.State<unknown>).get()).toBe(2)
  })

  it("Object.keys iterates property names", () => {
    const store = createStore({ a: 1, b: 2 })
    const keys = Object.keys(store)
    expect(keys).toContain("a")
    expect(keys).toContain("b")
    expect(keys.length).toBe(2)
  })

  it("'in' operator works", () => {
    const store = createStore({ a: 1 })
    expect("a" in store).toBe(true)
    expect("b" in store).toBe(false)
  })

  it("delete removes the property signal", () => {
    const store = createStore<Record<string, unknown>>({ a: 1, b: 2 })
    delete store.b
    expect(store.a.get()).toBe(1)
    expect("b" in store).toBe(false)
  })

  // ── fine-grained reactivity ────────────────────────────────────────

  it("computed subscribes only to properties it reads", () => {
    const store = createStore({ a: 1, b: 2, c: 3 })

    let runs = 0
    const sum = computed(() => {
      runs++
      return (store.a.get() as number) + (store.b.get() as number)
    })

    expect(sum.get()).toBe(3)
    expect(runs).toBe(1)

    store.a.set(10)
    expect(sum.get()).toBe(12)
    expect(runs).toBe(2)

    store.c.set(99)
    expect(sum.get()).toBe(12)
    expect(runs).toBe(2)
  })

  // ── nested stores ──────────────────────────────────────────────────

  it("nested store properties accessed via .get() are signals", () => {
    const store = createStore({ user: { name: "Alice", age: 30 } })

    const userStore = store.user.get()
    expect(userStore.name instanceof Signal.State).toBe(true)
    expect(userStore.name.get()).toBe("Alice")
    expect(userStore.age.get()).toBe(30)
  })

  it("nested store .set() updates are fine-grained", () => {
    const store = createStore({ user: { name: "Alice", age: 30 } })

    let nameRuns = 0
    let ageRuns = 0
    const userStore = store.user.get()
    const nameC = computed(() => { nameRuns++; return userStore.name.get() })
    const ageC = computed(() => { ageRuns++; return userStore.age.get() })
    const nw = new Signal.subtle.Watcher(() => {})
    const aw = new Signal.subtle.Watcher(() => {})
    nw.watch(nameC)
    aw.watch(ageC)
    nameC.get()
    ageC.get()
    nameRuns = 0
    ageRuns = 0

    userStore.name.set("Bob")

    nameC.get()
    ageC.get()
    expect(nameRuns).toBe(1)
    expect(ageRuns).toBe(0)
    expect(userStore.name.get()).toBe("Bob")
    expect(userStore.age.get()).toBe(30)
  })

  it("deeply nested stores work (3 levels)", () => {
    const store = createStore({ a: { b: { c: 1 } } })

    const bStore = store.a.get()
    const cSignal = bStore.b.get().c as Signal.State<number>
    expect(cSignal.get()).toBe(1)

    let runs = 0
    const comp = computed(() => { runs++; return cSignal.get() })
    const w = new Signal.subtle.Watcher(() => {})
    w.watch(comp)
    comp.get()
    runs = 0

    cSignal.set(2)
    comp.get()
    expect(runs).toBe(1)
    expect(cSignal.get()).toBe(2)
  })

  it("replacing entire nested object via .set() auto-wraps", () => {
    const store = createStore({ user: { name: "Alice", age: 30 } as Record<string, unknown> })

    store.user.set({ name: "Bob" })
    // .set() auto-wraps → the new object becomes a nested store
    const newUser = store.user.get()
    expect(newUser.name instanceof Signal.State).toBe(true)
    expect(newUser.name.get()).toBe("Bob")
    // age was not in the replacement, so it's gone
    expect("age" in newUser).toBe(false)
  })

  // ── edge cases ─────────────────────────────────────────────────────

  it("empty object", () => {
    const store = createStore<Record<string, unknown>>({})
    expect(Object.keys(store).length).toBe(0)
    store.x = 1 // convenience assignment via proxy set trap
    expect((store.x as Signal.State<unknown>).get()).toBe(1)
  })

  it("arrays are stored as-is (not deeply wrapped)", () => {
    const store = createStore({ items: [1, 2, 3] })
    expect(Array.isArray(store.items.get())).toBe(true)
    expect(store.items.get()).toEqual([1, 2, 3])
    store.items.set([4, 5])
    expect(store.items.get()).toEqual([4, 5])
  })

  it("null / undefined values", () => {
    const store = createStore<Record<string, unknown>>({ a: null, b: undefined })
    expect(store.a.get()).toBeNull()
    expect(store.b.get()).toBeUndefined()
    store.a.set("hello")
    store.b.set(42)
    expect(store.a.get()).toBe("hello")
    expect(store.b.get()).toBe(42)
  })

  // ── circular reference detection ───────────────────────────────────

  it("throws on self-referencing object in createStore", () => {
    const obj: Record<string, unknown> = { name: "x" }
    obj.self = obj
    expect(() => createStore(obj)).toThrow("Circular reference detected")
  })

  it("throws on mutual circular reference in createStore", () => {
    const a: Record<string, unknown> = { name: "a" }
    const b: Record<string, unknown> = { name: "b" }
    a.child = b
    b.parent = a
    expect(() => createStore({ root: a })).toThrow("Circular reference detected")
  })

  it("throws on circular reference via .set()", () => {
    const store = createStore<Record<string, unknown>>({ data: null })
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(() => {
      ;(store.data as Signal.State<unknown>).set(obj)
    }).toThrow("Circular reference detected")
  })

  it("allows shared (non-circular) object references", () => {
    const child = { name: "shared" }
    // Same object referenced twice — diamond, not cycle
    expect(() => createStore({ a: child, b: child })).not.toThrow()
  })
})
