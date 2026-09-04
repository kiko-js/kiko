/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx, Fragment, type Component, type JSX } from "../src/jsx-runtime"
import { realizeLazy as realize } from "../src/lazy-node"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

// This file is a compile-time check as much as a runtime one: the JSX below
// must type-check against `JSX.IntrinsicElements` and the generic `Component`.

describe("JSX types", () => {
  it("types an intrinsic element with attrs, children, ref, and events", () => {
    const ref: { current: HTMLInputElement | null } = { current: null }
    const el = (
      <input
        ref={ref}
        type="text"
        placeholder="Name"
        disabled={false}
        onClick={(_e: MouseEvent) => {}}
      >
        hi
      </input>
    ) as HTMLInputElement
    expect(el.tagName).toBe("INPUT")
    expect(ref.current).toBe(el)
  })

  it("rejects an event handler with the wrong type (type-level)", () => {
    // @ts-expect-error onClick must be a MouseEvent handler, not a number
    const bad: NonNullable<JSX.IntrinsicElements["div"]["onClick"]> = 123
    void bad
  })

  it("rejects a component called with missing required props (type-level)", () => {
    type Needs = { name: string }
    // @ts-expect-error missing `name`
    const bad: Parameters<Component<Needs>>[0] = {}
    void bad
  })

  it("types an SVG element with svg-specific props", () => {
    const svg = (
      <svg viewBox="0 0 10 10" width={10}>
        <circle cx={5} cy={5} r={4} fill="red" />
      </svg>
    ) as SVGSVGElement
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  it("types a generic function component", () => {
    type GreetProps = { name: string }
    const Greet: Component<GreetProps> = props => jsx("span", { children: `Hi ${props.name}` })

    const el = realize(jsx(Greet, { name: "World" })) as HTMLElement
    expect(el.textContent).toBe("Hi World")
  })

  it("types a Fragment with children", () => {
    const frag = Fragment({
      children: [jsx("span", { children: "A" }), jsx("span", { children: "B" })],
    })
    expect(frag.childNodes.length).toBe(2)
  })

  it("accepts a signal child", () => {
    const count = createSignal(0)
    const el = jsx("span", { children: count }) as HTMLElement
    expect(el.textContent).toBe("0")
  })
})
