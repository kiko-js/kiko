/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it, expect } from "bun:test"
import { render } from "../src/render"
import { Show } from "../src/flow"
import { jsx } from "../src/jsx-runtime"
import { createSignal } from "../src/signal"
import type { Component } from "../src/jsx-runtime"

describe("lazy jsx probe (experiment)", () => {
  it("defers component bodies until parent consumes children (parent scope)", () => {
    const order: string[] = []
    const Child: Component = () => {
      order.push("child-body")
      return jsx("span", { children: "c" })
    }
    function Parent(props: { children?: unknown }) {
      order.push("parent-body")
      return jsx("div", { children: props.children })
    }
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(jsx(Parent, { children: jsx(Child, null) }), container)
    expect(order).toEqual(["parent-body", "child-body"])
    expect(container.querySelector("span")?.textContent).toBe("c")
    dispose()
    container.remove()
  })

  it("Show skips untaken component branch entirely", () => {
    const ran: string[] = []
    const Truth: Component = () => {
      ran.push("truthy-body")
      return jsx("b", { children: "t" })
    }
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      <Show when={false} fallback={<span>f</span>}>
        <Truth />
      </Show>,
      container,
    )
    expect(ran).toEqual([])
    expect(container.querySelector("span")?.textContent).toBe("f")
    dispose()
    container.remove()
  })

  it("Show toggling keeps realized branch alive across swaps", async () => {
    const flush = (): Promise<void> => new Promise(r => queueMicrotask(r))
    const count = createSignal(false)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      <Show when={count} fallback={<span>off</span>}>
        <b>on</b>
      </Show>,
      container,
    )
    count.set(true)
    await flush()
    expect(container.querySelector("b")?.textContent).toBe("on")
    count.set(false)
    await flush()
    expect(container.querySelector("span")?.textContent).toBe("off")
    dispose()
    container.remove()
  })
})
