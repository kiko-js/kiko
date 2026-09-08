/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { render } from "../src/render"
import { NoSSR } from "../src/flow"
import { isLazy } from "../src/lazy-node"
import { toArray as childrenToArray, childTag, childProps } from "../src/children"

beforeAll(async () => {
  await import("./setup")
})

describe("KikoLazy 检查字段", () => {
  it("记录构造点的 tag 与 props，不执行组件体", () => {
    let ran = false
    function Card(props: { title: string }): Node {
      ran = true
      return jsx("div", { children: props.title })
    }
    const lazy = jsx(Card, { title: "hi" })
    expect(isLazy(lazy)).toBe(true)
    expect(ran).toBe(false)
    expect(childTag(lazy)).toBe(Card)
    expect(childProps(lazy)).toEqual({ title: "hi" })
  })
})

describe("children 检查型工具", () => {
  it("toArray 展平数组、丢弃空值，占位保持不透明", () => {
    let ran = false
    function Item(): Node {
      ran = true
      return jsx("li", { children: "x" })
    }
    const lazy = jsx(Item, {})
    const out = childrenToArray([lazy, null, false, undefined, [jsx("b", { children: "y" }), true]])
    expect(out.length).toBe(2)
    expect(out[0]).toBe(lazy)
    expect(ran).toBe(false)
    expect(childTag("plain")).toBeUndefined()
    expect(childProps(null)).toBeUndefined()
  })

  it("Tabs 式父组件按 tag 筛选：未选中分支体永不执行", () => {
    const ran: string[] = []
    function Tab(props: { name: string }): Node {
      ran.push(props.name)
      return jsx("span", { children: props.name })
    }
    function Tabs(props: { active: string; children: unknown }): Node {
      const picked = childrenToArray(props.children).filter(child => {
        if (childTag(child) !== Tab) return false
        const p = childProps(child)
        return typeof p === "object" && p !== null && "name" in p && p.name === props.active
      })
      return jsx("div", { children: picked }) as Node
    }
    const host = document.createElement("div")
    render(
      jsx(Tabs, {
        active: "b",
        children: [jsx(Tab, { name: "a" }), jsx(Tab, { name: "b" })],
      }) as unknown as Node,
      host,
    )
    expect(host.innerHTML).toBe("<div><span>b</span></div>")
    expect(ran).toEqual(["b"])
  })
})

describe("NoSSR 裸 children", () => {
  it("客户端直接传组件：渲染真实内容", () => {
    function Real(): Node {
      return jsx("p", { children: "real" })
    }
    const host = document.createElement("div")
    render(
      jsx(NoSSR, {
        fallback: jsx("span", { children: "skel" }),
        children: jsx(Real, {}),
      }) as unknown as Node,
      host,
    )
    expect(host.textContent).toBe("real")
  })

  it("函数形态仍兼容", () => {
    const host = document.createElement("div")
    render(
      jsx(NoSSR, {
        fallback: "skel",
        children: () => jsx("p", { children: "fn" }),
      }) as unknown as Node,
      host,
    )
    expect(host.textContent).toBe("fn")
  })
})
