import { test, expect } from "bun:test"
import {
  createStore,
  effect,
  computed,
  ref,
  isRef,
  REF,
  STORE_RAW,
  isSignal,
} from "../src/index.ts"

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
  // 两个 effect 互相写入构成循环:调度器的逐 effect 预算会切断它。
  // Bun 的 reportError 会把上报错误视为测试失败,这里捕获断言。
  const errors: unknown[] = []
  const prevReport = globalThis.reportError
  globalThis.reportError = (e: unknown) => errors.push(e)
  try {
    effect(() => store.a.set(store.b.get() + 1))
    effect(() => store.b.set(store.a.get() + 1))
    // 外部写入触发级联:两个 effect 交替重排,预算在 ~200 轮后切断循环
    store.b.set(5)
    for (let i = 0; i < 300; i++) await flush()
    expect(typeof store.a.get()).toBe("number")
    expect(typeof store.b.get()).toBe("number")
    expect(errors.length).toBeGreaterThan(0)
  } finally {
    globalThis.reportError = prevReport
  }
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

test("store nodes are not thenable", async () => {
  const store = createStore({ a: 1 })
  // 修复前:get trap 对未知属性返回可调用代理,store.then 是函数 →
  // await store 走 thenable 协议永不 resolve;isPromiseLike(store) 误判 true。
  expect(typeof (store as unknown as { then: unknown }).then).toBe("undefined")
  expect(typeof (store as unknown as { catch: unknown }).catch).toBe("undefined")
  expect(typeof (store as unknown as { finally: unknown }).finally).toBe("undefined")
  // 即使误入 Promise 决议路径也不应挂起
  const result = await Promise.race([Promise.resolve("ok"), store as unknown as Promise<string>])
  expect(result).toBe("ok")
  // 数据访问不受影响
  expect(store.a.get()).toBe(1)
  expect(store.get()).toEqual({ a: 1 })
})

test("STORE_RAW exposes the raw root even when data keys collide with the API", () => {
  const raw = { get: 1, set: 2, signal: 3, then: 4 }
  const store = createStore(raw)

  expect(store[STORE_RAW]).toBe(raw)
  // API surface still shadows the colliding data keys
  expect(typeof store.get).toBe("function")
  expect(typeof store.set).toBe("function")
  expect(typeof store.signal).not.toBe("undefined")
  // raw escape hatch can reach the colliding data values
  const rawStore = store[STORE_RAW] as { get: number; set: number; then: number }
  expect(rawStore.get).toBe(1)
  expect(rawStore.set).toBe(2)
  expect(rawStore.then).toBe(4)
})

test("proxy traps expose callable stores, keys, descriptors, and reject writes", () => {
  const store = createStore({ a: 1, b: 2 })

  const callableStore = store as unknown as { (): { a: number; b: number }; a: () => number }
  expect(callableStore()).toEqual({ a: 1, b: 2 })
  expect(callableStore.a()).toBe(1)

  expect(Object.keys(store)).toEqual(["a", "b"])
  expect("a" in store).toBe(true)
  expect("missing" in store).toBe(false)

  const desc = Object.getOwnPropertyDescriptor(store, "a")
  expect(desc?.value).toBe(1)
  expect(desc?.configurable).toBe(true)

  expect(() => {
    ;(store as unknown as Record<string, unknown>).a = 2
  }).toThrow(TypeError)
  expect(store.a.get()).toBe(1)
})

test("S2: get() returns a deep-frozen snapshot that cannot pollute the root", () => {
  const store = createStore({ a: { b: { c: 1 } } })
  const ab = store.a.b.get()
  // the returned object and its plain nested children are frozen
  expect(Object.isFrozen(ab)).toBe(true)
  expect(Object.isFrozen((store.a.get() as { b: unknown }).b)).toBe(true)
  expect(Object.isFrozen(store.get())).toBe(true)

  const before = store.a.b.c.get()
  // mutating the frozen snapshot must not change the underlying store value
  try {
    ;(ab as { c: number }).c = 999
  } catch {
    // strict-mode ESM throws on frozen writes — that is the intended guard
  }
  expect(store.a.b.c.get()).toBe(before)
  expect(store.a.b.get()).toEqual({ c: before })
})

test("S2: ref and opaque values are returned by reference and not frozen", () => {
  const date = new Date("2020-01-01T00:00:00Z")
  const store = createStore({ refVal: ref({ x: 1 }), date })
  // ref child is returned raw, never deep-frozen
  expect(Object.isFrozen(store.refVal.get())).toBe(false)
  // opaque built-ins are returned by reference, not frozen
  expect(Object.isFrozen(store.date.get())).toBe(false)
})

test("non-ref class instances and built-ins stay opaque terminals", () => {
  const date = new Date("2020-01-01T00:00:00Z")
  const map = new Map([["a", 1]])
  const store = createStore({ date, map, nested: { list: [1, 2] } })

  // opaque terminals are returned by reference
  expect(store.date.get()).toBe(date)
  expect(store.map.get()).toBe(map)
  expect(store.map.get().get("a")).toBe(1)

  // 终端对象本身可以整体替换
  const nextDate = new Date("2021-01-01T00:00:00Z")
  store.date.set(nextDate)
  expect(store.date.get()).toBe(nextDate)

  // 但不可下钻到终端对象内部去 set（保持 opaque）
  ;(store.date as unknown as { getTime: { set(v: number): void } }).getTime.set(123)
  expect(store.date.get().getTime()).toBe(nextDate.getTime())

  // plain nested objects remain reactive
  store.nested.list.set([3])
  expect(store.nested.list.get()).toEqual([3])
})

test("P2: Symbol.toPrimitive honors the coercion hint (store.a + 1 === 51)", () => {
  const store = createStore({ a: 50 })
  // "default"/"number" hint yields a Number so arithmetic is numeric, not concat
  expect((store.a as unknown as number) + 1).toBe(51)
  expect((store.a as unknown as number) * 2).toBe(100)
  // "string" hint yields a String
  expect(`${store.a}`).toBe("50")
  expect(String(store.a.get())).toBe("50")
  // non-numeric values fall back to String
  const s = createStore({ name: "kiko" })
  expect(`${s.name}`).toBe("kiko")
})

test("P3: native methods on a plain container operate on the live value", () => {
  const store = createStore({ items: [1, 2, 3] })
  const doubled = (store.items as unknown as number[]).map((n: number) => n * 2)
  expect(doubled).toEqual([2, 4, 6])
  // opaque terminals and nested store nodes keep their proxy-node behavior
  const withDate = createStore({ date: new Date("2020-01-01T00:00:00Z") })
  expect(typeof (withDate.date as unknown as { getTime: unknown }).getTime).toBe("function")
})

test("P4: store.<path>.signal.set() routes into the store root", async () => {
  const store = createStore({ a: 1, nested: { b: 2 } })
  // writing through the signal updates the store (and stays in sync with .get)
  store.a.signal!.set(9)
  expect(store.a.get()).toBe(9)
  expect(store.get()).toEqual({ a: 9, nested: { b: 2 } })
  store.nested.b.signal!.set(20)
  expect(store.nested.b.get()).toBe(20)
  expect(store.get()).toEqual({ a: 9, nested: { b: 20 } })

  // and it is reactive
  const log: number[] = []
  effect(() => log.push(store.a.get()))
  log.length = 0
  store.a.signal!.set(42)
  await flush()
  expect(log).toEqual([42])
})

test("P4: the exposed signal is a real, watchable Signal.State", () => {
  const store = createStore({ a: 1 })
  expect(isSignal(store.a.signal)).toBe(true)
})

test("S5: dropped dynamic keys release their trie signals instead of leaking", async () => {
  const store = createStore<{ byId: Record<string, number> }>({ byId: { a: 1, b: 2 } })
  // reading byId.a creates a trie Signal for that dynamic key
  const log: number[] = []
  effect(() => log.push(store.byId.a!.get()))
  expect(log).toEqual([1])
  log.length = 0
  // replace the whole map, dropping key "a"
  store.byId.set({ b: 2 })
  await flush()
  expect(log).toEqual([]) // old signal was disposed, no further notifications
  // re-adding the key creates a fresh signal (not resurrecting the old one)
  store.byId.set({ a: 5, b: 2 })
  await flush()
  // the new signal notifies the (new) effect subscription, not the disposed one
  expect(store.byId.a!.get()).toBe(5)
})

test("store proxy nodes keep identity across accesses and mutations", () => {
  const store = createStore({ a: { b: 1 }, arr: [1, 2] })
  // same path yields same proxy instance
  expect(store.a).toBe(store.a)
  expect(store.arr).toBe(store.arr)
  expect(store.a.b).toBe(store.a.b)
  // identity survives unrelated mutations
  const arrBefore = store.arr
  store.a.set({ b: 2 })
  expect(store.arr).toBe(arrBefore)
  expect(store.a).toBe(store.a)
  // identity survives the mutated path itself
  const aBefore = store.a
  store.a.b.set(3)
  expect(store.a).toBe(aBefore)
  expect(store.a.b.get()).toBe(3)
})
