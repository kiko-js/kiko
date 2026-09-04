/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it, expect } from "bun:test"
import { render } from "../src/render"
import { Show } from "../src/flow"
import { jsx } from "../src/jsx-runtime"
import { realize } from "@kikojs/dom"
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
    expect(container.querySelector("span")?.textContent).toBe("off")
    count.set(true)
    await flush()
    expect(container.querySelector("b")?.textContent).toBe("on")
    count.set(false)
    await flush()
    expect(container.querySelector("span")?.textContent).toBe("off")
    dispose()
    container.remove()
  })

  it("realize materializes a stable node (identity across renders)", () => {
    const Greet: Component = () => jsx("span", { children: "hi" })
    const el = realize(jsx(Greet, null) as Node) as HTMLElement
    expect(el.tagName).toBe("SPAN")
    const container = document.createElement("div")
    document.body.appendChild(container)
    render(el, container)
    expect(container.querySelector("span")?.textContent).toBe("hi")
    container.remove()
  })

  it("component ref fires once with the realized root element", () => {
    const seen: unknown[] = []
    const Card: Component = () => jsx("article", { children: jsx("h2", { children: "t" }) })
    const container = document.createElement("div")
    document.body.appendChild(container)
    // ref 是 jsx 层属性：组件收不到它，realize 出根元素后触发一次
    const dispose = render(jsx(Card, { ref: (el: Element) => void seen.push(el) }), container)
    expect(seen.length).toBe(1)
    expect(seen[0]).toBeInstanceOf(HTMLElement)
    expect((seen[0] as HTMLElement).tagName).toBe("ARTICLE")
    dispose()
    container.remove()
  })

  it("component ref cleanup runs on dispose", () => {
    let cleaned = 0
    const Box: Component = () => jsx("div", null)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(jsx(Box, { ref: () => () => void cleaned++ }), container)
    expect(cleaned).toBe(0)
    dispose()
    expect(cleaned).toBe(1)
    container.remove()
  })
})
