/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

describe("render", () => {
  it("mounts element into container", async () => {
    const { render } = await import("../src/render")
    const container = document.createElement("div")
    const el = jsx("span", { children: "mounted" })
    render(el, container)
    expect(container.innerHTML).toContain("mounted")
  })

  it("dispose clears container", async () => {
    const { render } = await import("../src/render")
    const container = document.createElement("div")
    const el = jsx("span", { children: "temp" })
    const dispose = render(el, container)
    dispose()
    expect(container.innerHTML).toBe("")
  })

  it("dispose cleans up signal watchers", async () => {
    const { render } = await import("../src/render")
    const container = document.createElement("div")
    const count = createSignal(0)
    const el = jsx("span", { children: count })
    const dispose = render(el, container)
    // Dispose should not throw (watchers cleaned up)
    expect(() => dispose()).not.toThrow()
    expect(container.innerHTML).toBe("")
  })

  it("re-render into same container cleans up the previous tree", async () => {
    const { render } = await import("../src/render")
    const container = document.createElement("div")
    const count = createSignal(0)
    const first = jsx("span", { children: count })
    render(first, container)
    count.set(5)
    const { promise: p, resolve } = Promise.withResolvers<void>()
    queueMicrotask(resolve)
    await p
    expect(container.textContent).toBe("5")

    // Mount a new tree into the same container — the old watchers must be
    // torn down so the detached `count` binding cannot resurrect old nodes.
    const other = createSignal("new")
    render(jsx("p", { children: other }), container)
    expect(container.textContent).toBe("new")
    // Mutating the old signal must not throw and must not affect the new tree.
    expect(() => count.set(99)).not.toThrow()
    const { promise: p2, resolve: r2 } = Promise.withResolvers<void>()
    queueMicrotask(r2)
    await p2
    expect(container.textContent).toBe("new")
  })
})
