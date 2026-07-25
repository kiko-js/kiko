import { describe, it, expect } from "bun:test"
import { on } from "../src/on"
import { effect } from "../src/effect"
import { createSignal } from "../src/signal"

function waitForMicrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("on", () => {
  it("runs on first run by default", async () => {
    const a = createSignal(1)
    let prev: number | undefined
    let runs = 0
    effect(
      on(
        () => a.get(),
        p => {
          prev = p
          runs++
        },
      ),
    )
    expect(runs).toBe(1)
    expect(prev).toBeUndefined()
  })

  it("passes the previous value on change", async () => {
    const a = createSignal(1)
    const prevs: (number | undefined)[] = []
    effect(
      on(
        () => a.get(),
        p => {
          prevs.push(p)
        },
      ),
    )
    expect(prevs).toEqual([undefined])
    a.set(2)
    await waitForMicrotask()
    expect(prevs).toEqual([undefined, 1])
    a.set(3)
    await waitForMicrotask()
    expect(prevs).toEqual([undefined, 1, 2])
  })

  it("does not re-run when non-tracked signals change", async () => {
    const a = createSignal(1)
    const b = createSignal(100)
    let runs = 0
    effect(
      on(
        () => a.get(),
        () => {
          runs++
          b.get()
        },
      ),
    )
    expect(runs).toBe(1)
    b.set(200)
    await waitForMicrotask()
    expect(runs).toBe(1)
    a.set(2)
    await waitForMicrotask()
    expect(runs).toBe(2)
  })

  it("supports an array of deps", async () => {
    const a = createSignal(1)
    const b = createSignal(10)
    const prevs: (number[] | undefined)[] = []
    effect(
      on([() => a.get(), () => b.get()], p => {
        prevs.push(p)
      }),
    )
    expect(prevs).toEqual([undefined])
    a.set(2)
    await waitForMicrotask()
    expect(prevs[1]).toEqual([1, 10])
    b.set(20)
    await waitForMicrotask()
    expect(prevs[2]).toEqual([2, 10])
  })

  it("defers the first run with defer: true", async () => {
    const a = createSignal(1)
    let runs = 0
    let prev: number | undefined
    const dispose = effect(
      on(
        () => a.get(),
        p => {
          prev = p
          runs++
        },
        { defer: true },
      ),
    )
    expect(runs).toBe(0)
    a.set(2)
    await waitForMicrotask()
    expect(runs).toBe(1)
    expect(prev).toBe(1)
    dispose()
  })
})
