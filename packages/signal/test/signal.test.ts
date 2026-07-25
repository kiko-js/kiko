import { describe, it, expect } from "bun:test"
import { Signal } from "signal-polyfill"
import { createSignal, isSignal } from "../src/signal"

describe("createSignal", () => {
  it("creates a signal with initial value", () => {
    const s = createSignal(42)
    expect(s.get()).toBe(42)
  })

  it("set updates the value", () => {
    const s = createSignal(42)
    s.set(99)
    expect(s.get()).toBe(99)
  })

  it("set skips equal value (no watcher notification)", () => {
    const s = createSignal(42)
    let runs = 0
    const watcher = new Signal.subtle.Watcher(() => {
      runs++
    })
    watcher.watch(s)
    s.set(42)
    expect(runs).toBe(0)
    expect(s.get()).toBe(42)
  })

  it("returns a Signal.State instance", () => {
    const s = createSignal(0)
    expect(s instanceof Signal.State).toBe(true)
  })

  it("isSignal detects created signals", () => {
    const s = createSignal("hello")
    expect(isSignal(s)).toBe(true)
  })

  it("isSignal detects Signal.Computed", () => {
    const c = new Signal.Computed(() => 42)
    expect(isSignal(c)).toBe(true)
  })

  it("isSignal rejects plain objects", () => {
    expect(isSignal({})).toBe(false)
    expect(isSignal(null)).toBe(false)
    expect(isSignal(42)).toBe(false)
  })
})
