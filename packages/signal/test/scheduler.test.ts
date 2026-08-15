import { describe, it, expect } from "bun:test"
import { batch, untrack } from "../src/scheduler"
import { effect } from "../src/effect"
import { computed } from "../src/computed"
import { createSignal } from "../src/signal"

function waitForMicrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("batch", () => {
  it("coalesces multiple signal writes into a single effect run", async () => {
    const a = createSignal(1)
    const b = createSignal(1)
    let runs = 0
    effect(() => {
      a.get()
      b.get()
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      a.set(2)
      b.set(2)
      a.set(3)
    })
    await waitForMicrotask()
    expect(runs).toBe(2)
  })

  it("preserves the return value", () => {
    const result = batch(() => 42)
    expect(result).toBe(42)
  })

  it("flushes on outermost batch exit when nested", async () => {
    const a = createSignal(0)
    let runs = 0
    effect(() => {
      a.get()
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      a.set(1)
      batch(() => {
        a.set(2)
      })
      // inner batch must not flush
      expect(runs).toBe(1)
    })
    await waitForMicrotask()
    expect(runs).toBe(2)
  })

  it("recovers when the batch body throws", async () => {
    const a = createSignal(0)
    let runs = 0
    effect(() => {
      a.get()
      runs++
    })
    expect(runs).toBe(1)
    // batchDepth 在 finally 中恢复：抛错后写入仍能正常 flush
    expect(() =>
      batch(() => {
        a.set(1)
        throw new Error("boom")
      }),
    ).toThrow("boom")
    await waitForMicrotask()
    expect(runs).toBe(2)
    a.set(2)
    await waitForMicrotask()
    expect(runs).toBe(3)
  })
})

describe("untrack", () => {
  it("reads a signal without subscribing", async () => {
    const a = createSignal(1)
    const b = createSignal(10)
    let runs = 0
    effect(() => {
      a.get()
      untrack(() => b.get())
      runs++
    })
    expect(runs).toBe(1)
    b.set(20)
    await waitForMicrotask()
    expect(runs).toBe(1)
    a.set(2)
    await waitForMicrotask()
    expect(runs).toBe(2)
  })

  it("returns the inner value", () => {
    const a = createSignal("hi")
    expect(untrack(() => a.get())).toBe("hi")
  })

  it("does not break computed tracking", () => {
    const a = createSignal(2)
    const c = computed(() => untrack(() => a.get()) * 3)
    expect(c.get()).toBe(6)
    a.set(4)
    // computed reads a via untrack, so it never subscribed — stale value
    expect(c.get()).toBe(6)
  })
})

describe("circular effect guard", () => {
  it("cuts a cross-effect cycle without dropping unrelated effects", async () => {
    const errors: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => errors.push(e)
    try {
      const a = createSignal(0)
      const b = createSignal(0)
      // 交叉循环:A 写 a(依赖 b),B 写 b(依赖 a),互相失效级联。
      // 单 effect 自写会被 polyfill 吸收(求值期间的失效),不会级联。
      effect(() => a.set(b.get() + 1))
      effect(() => b.set(a.get() + 1))
      const c = createSignal(0)
      let cRuns = 0
      effect(() => {
        c.get()
        cRuns++
      })
      // 外部写入启动级联:交替重排,预算在 ~200 轮后切断
      b.set(5)
      for (let i = 0; i < 400; i++) await waitForMicrotask()
      expect(errors.length).toBeGreaterThan(0)
      // 循环被切断后值不再增长
      const aVal = a.get()
      const bVal = b.get()
      await waitForMicrotask()
      expect(a.get()).toBe(aVal)
      expect(b.get()).toBe(bVal)
      // 无关 effect 不受影响,后续更新照常
      expect(cRuns).toBe(1)
      c.set(1)
      await waitForMicrotask()
      expect(cRuns).toBe(2)
    } finally {
      globalThis.reportError = prevReport
    }
  })
})
