import { describe, it, expect } from "bun:test"
import { onCleanup } from "../src/scope"
import { effect } from "../src/effect"
import { createSignal } from "../src/signal"

function waitForMicrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("onCleanup", () => {
  it("runs cleanups before the next effect run", async () => {
    const count = createSignal(0)
    const log: string[] = []
    effect(() => {
      const c = count.get()
      onCleanup(() => {
        log.push(`cleanup:${c}`)
      })
    })
    expect(log).toEqual([])
    count.set(1)
    await waitForMicrotask()
    expect(log).toEqual(["cleanup:0"])
    count.set(2)
    await waitForMicrotask()
    expect(log).toEqual(["cleanup:0", "cleanup:1"])
  })

  it("runs cleanups on dispose", async () => {
    const count = createSignal(0)
    const log: string[] = []
    const dispose = effect(() => {
      count.get()
      onCleanup(() => {
        log.push("disposed")
      })
    })
    expect(log).toEqual([])
    dispose()
    expect(log).toEqual(["disposed"])
    count.set(1)
    await waitForMicrotask()
    expect(log).toEqual(["disposed"])
  })

  it("runs cleanups in reverse registration order", async () => {
    const count = createSignal(0)
    const order: number[] = []
    effect(() => {
      count.get()
      onCleanup(() => order.push(1))
      onCleanup(() => order.push(2))
      onCleanup(() => order.push(3))
    })
    count.set(1)
    await waitForMicrotask()
    expect(order).toEqual([3, 2, 1])
  })

  it("is a no-op outside an effect scope", () => {
    expect(() => onCleanup(() => {})).not.toThrow()
  })

  it("survives a cleanup that throws", async () => {
    const count = createSignal(0)
    const log: string[] = []
    effect(() => {
      const c = count.get()
      onCleanup(() => {
        log.push(`first:${c}`)
      })
      onCleanup(() => {
        throw new Error("boom")
      })
      onCleanup(() => {
        log.push(`third:${c}`)
      })
    })
    count.set(1)
    await waitForMicrotask()
    // third then first (reverse order); the throwing cleanup does not abort siblings
    expect(log).toEqual(["third:0", "first:0"])
  })
})
