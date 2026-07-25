import { describe, it, expect } from "bun:test"
import { computed, derived, toSignalValue } from "../src/computed"
import { createSignal } from "../src/signal"

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
