import { describe, it, expect } from "bun:test"
import { effect } from "../src/effect"
import { createSignal } from "../src/signal"

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
