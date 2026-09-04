/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it, expect } from "bun:test"
import { render } from "../src/render"
import { Show } from "../src/flow"
import { jsx } from "../src/jsx-runtime"
import { realizeLazy as realize } from "../src/lazy-node"
import type { Component } from "../src/jsx-runtime"

/**
 * 惰性物化契约：`jsx(组件)` 返回待物化占位，组件体推迟到消费点执行。
 * 消费点：render / appendChild（intrinsic children）/ toNodes（控制流）/
 * 水合采纳。`realize` 是显式物化出口，组件 `ref` 在物化出根元素后触发。
 */
describe("lazy jsx materialization", () => {
  it("defers component bodies until the parent consumes them (parent scope)", () => {
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
    // 急切语义下 children 先于父组件体执行；惰性下 children 在父组件体内消费
    expect(order).toEqual(["parent-body", "child-body"])
    expect(container.querySelector("span")?.textContent).toBe("c")
    dispose()
    container.remove()
  })

  it("Show skips untaken component branches entirely", () => {
    const ran: string[] = []
    const Truthy: Component = () => {
      ran.push("truthy-body")
      return jsx("b", { children: "t" })
    }
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      <Show when={false} fallback={<span>f</span>}>
        <Truthy />
      </Show>,
      container,
    )
    expect(ran).toEqual([])
    expect(container.querySelector("span")?.textContent).toBe("f")
    dispose()
    container.remove()
  })

  it("realize materializes a stable node (identity preserved across renders)", () => {
    const Greet: Component = () => jsx("span", { children: "hi" })
    const el = realize(jsx(Greet, null)) as HTMLElement
    expect(el.tagName).toBe("SPAN")
    const container = document.createElement("div")
    document.body.appendChild(container)
    render(el, container)
    expect(container.querySelector("span")?.textContent).toBe("hi")
    container.remove()
  })

  it("component ref fires once with the realized root element", () => {
    const seen: Element[] = []
    const Card: Component = () => jsx("article", { children: jsx("h2", { children: "t" }) })
    const container = document.createElement("div")
    document.body.appendChild(container)
    // ref 是 jsx 层属性：组件收不到它，物化出根元素后触发一次
    const dispose = render(jsx(Card, { ref: (el: Element) => void seen.push(el) }), container)
    expect(seen.length).toBe(1)
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
