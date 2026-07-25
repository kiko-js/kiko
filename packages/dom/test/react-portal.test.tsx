/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { ReactPortal } from "../src/react-portal"
import { createSignal } from "../src/signal"
import { cleanupWatchers } from "../src/jsx-runtime"
import React from "react"

beforeAll(async () => {
  await import("./setup")
})

describe("ReactPortal", () => {
  it("returns a container div synchronously", () => {
    const MockComp = () => null
    const el = ReactPortal({ component: MockComp }) as HTMLElement
    expect(el.tagName).toBe("DIV")
  })

  it("creates a unique container per call", () => {
    const MockComp = () => null
    const a = ReactPortal({ component: MockComp })
    const b = ReactPortal({ component: MockComp })
    expect(a).not.toBe(b)
  })

  // Wait until `predicate` is truthy, polling on macrotasks (React 19 commits
  // on the macrotask queue in happy-dom). Resolves when the predicate passes or
  // after `deadlineMs` — caller then asserts the expected state.
  async function waitFor(predicate: () => boolean, deadlineMs = 1000): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
      if (Date.now() - start >= deadlineMs) return
      const { promise, resolve } = Promise.withResolvers<void>()
      setTimeout(resolve, 0)
      await promise
    }
  }

  it("re-renders React when a signal prop changes", async () => {
    const count = createSignal(0)
    const renderCount = { current: 0 }
    const Comp = (props: { count: number }) => {
      renderCount.current += 1
      return React.createElement("span", null, String(props.count))
    }
    const container = ReactPortal({ component: Comp, count })
    await waitFor(() => renderCount.current >= 1)
    expect(renderCount.current).toBe(1)

    count.set(7)
    await waitFor(() => renderCount.current >= 2)
    expect(renderCount.current).toBe(2)
    void container
  })

  it("stops re-rendering after dispose unmounts the React root", async () => {
    const count = createSignal(0)
    const renderCount = { current: 0 }
    const Comp = (props: { count: number }) => {
      renderCount.current += 1
      return React.createElement("span", null, String(props.count))
    }
    const container = ReactPortal({ component: Comp, count })
    await waitFor(() => renderCount.current >= 1)
    expect(renderCount.current).toBe(1)

    cleanupWatchers(container)
    count.set(99)
    // Give React a chance to (wrongly) render again; the disposed root must not.
    await waitFor(() => renderCount.current >= 2, 100)
    expect(renderCount.current).toBe(1)
  })
})
