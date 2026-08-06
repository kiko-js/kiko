import { describe, it, expect } from "bun:test"
import { computed, derived, toSignalValue, watchValue } from "../src/computed"
import { createSignal } from "../src/signal"

function waitForMicrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("computed", () => {
  it("derives value from a signal", () => {
    const count = createSignal(2)
    const doubled = computed(() => count.get() * 2)
    expect(doubled.get()).toBe(4)
  })

  it("updates when source signal changes", () => {
    const count = createSignal(2)
    const doubled = computed(() => count.get() * 2)
    count.set(5)
    expect(doubled.get()).toBe(10)
  })

  it("is read-only", () => {
    const c = computed(() => 1)
    expect((c as unknown as Record<string, unknown>).set).toBeUndefined()
  })
})

describe("derived", () => {
  it("is an alias for computed", () => {
    const a = createSignal(1)
    const b = derived(() => a.get() + 1)
    expect(b.get()).toBe(2)
  })
})

describe("toSignalValue", () => {
  it("returns plain values", () => {
    expect(toSignalValue(42)).toBe(42)
  })

  it("unwraps signals", () => {
    const s = createSignal("hello")
    expect(toSignalValue(s)).toBe("hello")
  })
})

describe("watchValue", () => {
  it("calls back immediately for plain values and returns null", () => {
    const calls: number[] = []
    const w = watchValue(42, v => {
      calls.push(v)
    })
    expect(calls).toEqual([42])
    expect(w).toBeNull()
  })

  it("subscribes to a signal and returns a watcher", async () => {
    const s = createSignal(1)
    const calls: number[] = []
    const w = watchValue(s, v => {
      calls.push(v)
    })
    expect(w).not.toBeNull()
    // 信号不立即回调；回调在微任务中执行（通知阶段读信号会抛错）
    expect(calls).toEqual([])
    s.set(2)
    await waitForMicrotask()
    expect(calls).toEqual([2])
    s.set(3)
    await waitForMicrotask()
    expect(calls).toEqual([2, 3])
    w!.unwatch(s)
    s.set(4)
    await waitForMicrotask()
    expect(calls).toEqual([2, 3])
  })
})
