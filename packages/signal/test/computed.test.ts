import { describe, expect, it } from "bun:test"
import { computed, toSignalValue, watchValue } from "../src/computed"
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

  it("forbids signal writes inside the computed body", () => {
    const s = createSignal(1)
    const c = computed(() => {
      s.set(2)
      return s.get()
    })
    expect(() => c.get()).toThrow(/Signal writes are not allowed inside a computed/)
    // 写入被拒绝后，computed 不应留下半个更新结果
    expect(s.get()).toBe(1)
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

  it("re-arms the watcher after a throwing callback", async () => {
    const s = createSignal(1)
    const calls: number[] = []
    let shouldThrow = true
    const errors: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => errors.push(e)
    try {
      const w = watchValue(s, v => {
        calls.push(v)
        if (shouldThrow) throw new Error("boom")
      })
      s.set(2)
      await waitForMicrotask()
      expect(calls).toEqual([2])
      expect(errors.length).toBe(1)
      // 修复前:回调抛错跳过 re-arm,one-shot watcher 永久失效
      shouldThrow = false
      s.set(3)
      await waitForMicrotask()
      expect(calls).toEqual([2, 3])
      w!.unwatch(s)
    } finally {
      globalThis.reportError = prevReport
    }
  })
})
