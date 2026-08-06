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
