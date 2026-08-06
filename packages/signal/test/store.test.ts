import { test, expect } from "bun:test"
import { createStore, effect, computed, ref, isRef, REF } from "../src/index.ts"

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

test("get returns current value", () => {
  const store = createStore({ a: { b: { c: 1 } } })
  expect(store.a.b.c.get()).toBe(1)
  expect(store.a.b.get()).toEqual({ c: 1 })
  expect(store.get()).toEqual({ a: { b: { c: 1 } } })
})

test("set updates value immutably", () => {
  const store = createStore({ a: { b: { c: 1 } } })
  const before = store.get()
  store.a.b.c.set(2)
  const after = store.get()
  expect(after).toEqual({ a: { b: { c: 2 } } })
  expect(after).not.toBe(before)
  expect(after.a).not.toBe(before.a)
  expect(after.a.b).not.toBe(before.a.b)
  expect(store.a.b.c.get()).toBe(2)
})

test("parent signals fire when child changes, siblings do not", async () => {
  const store = createStore({ a: { b: { c: 1, d: 2 } } })
  const ab = store.a.b
  const abc = store.a.b.c
  const abd = store.a.b.d

  const log: string[] = []
  effect(() => {
    log.push(`ab:${JSON.stringify(ab.get())}`)
  })
  effect(() => {
    log.push(`abc:${abc.get()}`)
  })
  effect(() => {
    log.push(`abd:${abd.get()}`)
  })

  // initial runs
  expect(log).toContain('ab:{"c":1,"d":2}')
  expect(log).toContain("abc:1")
  expect(log).toContain("abd:2")

  log.length = 0
  abc.set(10)
  await flush()

  expect(log).toContain('ab:{"c":10,"d":2}')
  expect(log).toContain("abc:10")
  expect(log).not.toContain("abd:2")
  expect(log).not.toContain("abd:10")
})

test("setting parent triggers descendant signal reads", async () => {
  const store = createStore({ a: { b: { c: 1, d: 2 } } })
  const abc = store.a.b.c
  const abd = store.a.b.d

  const log: string[] = []
  effect(() => log.push(`abc:${abc.get()}`))
  effect(() => log.push(`abd:${abd.get()}`))

  log.length = 0
  store.a.b.set({ c: 100, d: 200 })
  await flush()

  expect(log).toContain("abc:100")
  expect(log).toContain("abd:200")
})

test("computed derives from store values", () => {
  const store = createStore({ a: { b: { c: 1, d: 2 } } })
  const sum = computed(() => store.a.b.c.get() + store.a.b.d.get())
  expect(sum.get()).toBe(3)
  store.a.b.c.set(5)
  expect(sum.get()).toBe(7)
})

test("array index access works", () => {
  const store = createStore({ items: [1, 2, 3] })
  expect(store.items[1]!.get()).toBe(2)
  store.items[1]!.set(20)
  expect(store.items.get()).toEqual([1, 20, 3])
})

test("root set replaces whole state", () => {
  const store = createStore({ a: 1 })
  const a = store.a
  effect(() => a.get())
  store.set({ a: 2 })
  expect(a.get()).toBe(2)
})

test("ref is a terminal node", async () => {
  const store = createStore({ a: ref({ b: 1, c: 2 }) })
  expect(isRef(store.a.get())).toBe(false)
  expect(store.a.get()).toEqual({ b: 1, c: 2 })
  expect(store.a.b.get()).toBe(1)

  const log: string[] = []
  effect(() => log.push(`a:${JSON.stringify(store.a.get())}`))
  effect(() => log.push(`ab:${store.a.b.get()}`))

  log.length = 0
  store.a.set(ref({ b: 10, c: 20 }))
  await flush()

  expect(log).toContain('a:{"b":10,"c":20}')
  // under ref, child reads are not reactive
  expect(log).not.toContain("ab:10")
  expect(store.a.b.get()).toBe(10)
})

test("mutating ref child does not trigger reactive updates", () => {
  const inner = { b: 1 }
  const store = createStore({ a: ref(inner) })
  const a = store.a

  const log: string[] = []
  effect(() => log.push(`a:${JSON.stringify(a.get())}`))

  log.length = 0
  inner.b = 2
  expect(a.get()).toEqual({ b: 2 })
  expect(log.length).toBe(0)
})

test("ref marker symbol is exposed", () => {
  const r = ref(1)
  expect(r[REF]).toBe(true)
  expect(r.value).toBe(1)
})

test("ref preserves special objects and does not break them", async () => {
  class ThreeLike {
    position = { x: 0, y: 0 }
    render() {
      return "rendered"
    }
  }
  const obj = new ThreeLike()
  const store = createStore({ model: ref(obj) })

  // get returns same reference
  expect(store.model.get()).toBe(obj)
  expect(store.model.get().render()).toBe("rendered")

  // child access is raw, does not track
  const log: string[] = []
  effect(() => log.push(`x:${store.model.position.x.get()}`))
  effect(() => log.push(`model:${store.model.get().render()}`))

  log.length = 0
  obj.position.x = 5
  await flush()
  expect(log.length).toBe(0)

  // whole replacement triggers update
  const next = new ThreeLike()
  log.length = 0
  store.model.set(ref(next))
  await flush()
  expect(store.model.get()).toBe(next)
  expect(log).toContain("model:rendered")
})

test("effect self-cycle is bounded", async () => {
  const store = createStore({ a: 1 })
  effect(() => {
    store.a.set(store.a.get() + 1)
  })
  await flush()
  expect(store.a.get()).toBe(2)
})

test("effect cross-cycle is bounded", async () => {
  const store = createStore({ a: 1, b: 1 })
  effect(() => store.a.set(store.b.get() + 1))
  effect(() => store.b.set(store.a.get() + 1))
  await flush()
  expect(typeof store.a.get()).toBe("number")
  expect(typeof store.b.get()).toBe("number")
})

test("circular references do not cause infinite loops", () => {
  type Circular = { a: number; self?: Circular }
  const circular: Circular = { a: 1 }
  circular.self = circular
  const store = createStore({ data: circular })

  expect(store.data.get()).toBe(circular)
  expect(store.data.self!.get()).toBe(circular)

  store.data.a.set(2)
  expect(store.data.a.get()).toBe(2)
  expect(store.data.self!.get()).toBe(circular)
})

test("self-referencing store path is handled", () => {
  const store = createStore<{ data: unknown }>({ data: null })
  store.data.set(store)
  expect(store.data.get()).toBe(store)
  // accessing a child on the proxy returns another proxy without hanging
  expect(typeof (store.data as unknown as Record<string, unknown>).data).toBeOneOf([
    "object",
    "function",
  ])
})

test("ref with circular value stays opaque", async () => {
  const circular: Record<string, unknown> = { value: 1 }
  circular.self = circular
  const store = createStore({ model: ref(circular) })

  const log: string[] = []
  effect(() => log.push(`model:${store.model.get() === circular}`))

  log.length = 0
  circular.value = 2
  await flush()
  expect(log.length).toBe(0)

  const next: Record<string, unknown> = { value: 3 }
  next.self = next
  store.model.set(ref(next))
  await flush()
  expect(store.model.get()).toBe(next)
  expect(log).toContain("model:false")
})

test("array index access and array replacement", () => {
  const store = createStore({ items: [1, 2, 3] })
  expect(store.items[1]!.get()).toBe(2)
  expect(store.items.length.get()).toBe(3)
  store.items[1]!.set(20)
  expect(store.items.get()).toEqual([1, 20, 3])
  store.items.set([4, 5])
  expect(store.items.get()).toEqual([4, 5])
})

test("set to the same value does not notify", async () => {
  const store = createStore({ a: { b: 1 } })
  const ab = store.a.b
  const log: number[] = []
  effect(() => log.push(ab.get()))
  expect(log).toEqual([1])
  log.length = 0
  ab.set(1)
  await flush()
  expect(log).toEqual([])
  ab.set(2)
  await flush()
  expect(log).toEqual([2])
})

test("array length signal updates when the array is replaced", async () => {
  const store = createStore({ items: [1, 2, 3] })
  const lengths: number[] = []
  effect(() => lengths.push(store.items.length.get()))
  expect(lengths).toEqual([3])
  store.items.set([4, 5])
  await flush()
  expect(lengths).toEqual([3, 2])
})

test("symbol keys are addressable", () => {
  const sym = Symbol("k")
  const store = createStore<{ [sym]: number }>({ [sym]: 1 })
  expect(store[sym].get()).toBe(1)
  store[sym].set(5)
  expect(store[sym].get()).toBe(5)
  expect(store.get()).toEqual({ [sym]: 5 })
})

test("symbol key changes notify", async () => {
  const sym = Symbol("k")
  const store = createStore<{ [sym]: number }>({ [sym]: 1 })
  const log: number[] = []
  effect(() => log.push(store[sym].get()))
  expect(log).toEqual([1])
  store[sym].set(9)
  await flush()
  expect(log).toEqual([1, 9])
})

test("reading a missing path yields undefined without throwing", () => {
  const store = createStore<{ a?: { b: number } }>({})
  expect(store.a?.get()).toBeUndefined()
  // 缺失路径的深层访问：运行时返回 undefined 而非抛错
  const deep = (store as unknown as { a: { b: { get(): unknown } } }).a.b
  expect(deep.get()).toBeUndefined()
})
