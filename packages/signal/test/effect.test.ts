import { describe, it, expect } from "bun:test"
import { effect } from "../src/effect"
import { createSignal } from "../src/signal"
import { onCleanup } from "../src/scope"

function waitForMicrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("effect", () => {
  it("runs immediately", () => {
    let runs = 0
    effect(() => {
      runs++
    })
    expect(runs).toBe(1)
  })

  it("re-runs when signal changes", async () => {
    const count = createSignal(0)
    let runs = 0
    effect(() => {
      count.get()
      runs++
    })
    expect(runs).toBe(1)
    count.set(1)
    await waitForMicrotask()
    expect(runs).toBe(2)
  })

  it("cleans up previous effect", async () => {
    const count = createSignal(0)
    let cleanups = 0
    effect(() => {
      count.get()
      return () => {
        cleanups++
      }
    })
    expect(cleanups).toBe(0)
    count.set(1)
    await waitForMicrotask()
    expect(cleanups).toBe(1)
  })

  it("dispose stops re-running", async () => {
    const count = createSignal(0)
    let runs = 0
    const cleanup = effect(() => {
      count.get()
      runs++
    })
    expect(runs).toBe(1)
    cleanup()
    count.set(1)
    await waitForMicrotask()
    expect(runs).toBe(1)
  })

  it("discards non-function return values (not treated as cleanup)", async () => {
    const count = createSignal(0)
    let runs = 0
    // 表达式体 effect 返回数字：不得作为 cleanup 也不得抛错
    effect(() => {
      count.get()
      runs++
      return 42
    })
    expect(runs).toBe(1)
    count.set(1)
    await waitForMicrotask()
    expect(runs).toBe(2)
    count.set(2)
    await waitForMicrotask()
    expect(runs).toBe(3)
  })

  it("dispose is idempotent and runs the cleanup once", async () => {
    const count = createSignal(0)
    let cleanups = 0
    const dispose = effect(() => {
      count.get()
      return () => {
        cleanups++
      }
    })
    dispose()
    dispose()
    expect(cleanups).toBe(1)
    count.set(1)
    await waitForMicrotask()
    expect(cleanups).toBe(1)
  })
})

describe("effect cleanup semantics", () => {
  it("cleanup signal reads do not become effect dependencies", async () => {
    const a = createSignal(1)
    const b = createSignal(10)
    let runs = 0
    const cleanupReads: number[] = []
    const stop = effect(() => {
      runs++
      a.get()
      onCleanup(() => {
        cleanupReads.push(b.get())
      })
    })
    expect(runs).toBe(1)
    // 修复前:清理在 computed 内执行,b 被记为依赖,b 变化导致 effect 重跑。
    // 修复后:b 变化不触发重跑(清理读取不订阅),清理也未执行。
    b.set(20)
    await waitForMicrotask()
    expect(runs).toBe(1)
    expect(cleanupReads).toEqual([])
    // 真正重跑时清理照常执行,读到当前 b 值
    a.set(2)
    await waitForMicrotask()
    expect(runs).toBe(2)
    expect(cleanupReads).toEqual([20])
    stop()
  })

  it("a throwing returned cleanup does not wedge the effect", async () => {
    const a = createSignal(1)
    let runs = 0
    let shouldThrow = true
    const errors: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => errors.push(e)
    try {
      const stop = effect(() => {
        runs++
        a.get()
        return () => {
          if (shouldThrow) throw new Error("cleanup boom")
        }
      })
      expect(runs).toBe(1)
      a.set(2)
      await waitForMicrotask()
      // 修复前:清理抛错 → computed 缓存 ERRORED,effect 体不再执行
      expect(runs).toBe(2)
      shouldThrow = false
      a.set(3)
      await waitForMicrotask()
      expect(runs).toBe(3)
      stop()
    } finally {
      globalThis.reportError = prevReport
    }
  })

  it("returned cleanup and onCleanup share one reverse order on re-run and dispose", async () => {
    const a = createSignal(0)
    const order: string[] = []
    const dispose = effect(() => {
      a.get()
      onCleanup(() => order.push("scope"))
      return () => order.push("returned")
    })
    expect(order).toEqual([])
    a.set(1)
    await waitForMicrotask()
    // 返回式清理最后注册 → 逆序最先执行;重跑与 dispose 顺序一致
    expect(order).toEqual(["returned", "scope"])
    dispose()
    expect(order).toEqual(["returned", "scope", "returned", "scope"])
  })
})

describe("effect error isolation", () => {
  it("isolates a throwing effect from sibling effects", async () => {
    const a = createSignal(0)
    const b = createSignal(0)
    const errors: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => errors.push(e)
    try {
      let bRuns = 0
      effect(() => {
        a.get()
        if (a.get() === 1) throw new Error("boom")
      })
      effect(() => {
        b.get()
        bRuns++
      })
      expect(bRuns).toBe(1)
      a.set(1)
      b.set(1)
      await waitForMicrotask()
      // sibling effect still ran despite the other throwing
      expect(bRuns).toBe(2)
      expect(errors.length).toBeGreaterThan(0)
    } finally {
      globalThis.reportError = prevReport
    }
  })

  it("re-runs after a throwing run when the signal changes again", async () => {
    const a = createSignal(0)
    const prevReport = globalThis.reportError
    const errors: unknown[] = []
    globalThis.reportError = (e: unknown) => errors.push(e)
    let runs = 0
    try {
      effect(() => {
        runs++
        if (a.get() === 1) throw new Error("boom")
      })
      expect(runs).toBe(1)
      a.set(1)
      await waitForMicrotask()
      expect(errors.length).toBe(1)
      a.set(2)
      await waitForMicrotask()
      expect(runs).toBe(3)
    } finally {
      globalThis.reportError = prevReport
    }
  })
})
