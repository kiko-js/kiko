/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx, Fragment, cleanupWatchers } from "../src/jsx-runtime"
import { realizeLazy as realize } from "../src/lazy-node"
import { render } from "../src/render"
import type { Component } from "../src/jsx-runtime"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("jsx", () => {
  it("creates an element from string tag", () => {
    const el = jsx("div", { id: "root" }) as HTMLElement
    expect(el.tagName).toBe("DIV")
    expect(el.id).toBe("root")
  })

  it("renders text children", () => {
    const el = jsx("span", { children: "hello" }) as HTMLElement
    expect(el.textContent).toBe("hello")
  })

  it("renders nested elements", () => {
    const el = jsx("div", {
      children: jsx("span", { children: "nested" }),
    }) as HTMLElement
    expect(el.innerHTML).toContain("<span>nested</span>")
  })

  it("renders multiple children", () => {
    const el = jsx("div", {
      children: [jsx("span", { children: "A" }), jsx("span", { children: "B" })],
    }) as HTMLElement
    expect(el.children.length).toBe(2)
  })

  it("sets attributes", () => {
    const el = jsx("input", { type: "text", placeholder: "Name" }) as HTMLInputElement
    expect(el.getAttribute("type")).toBe("text")
    expect(el.getAttribute("placeholder")).toBe("Name")
  })

  it("attaches event listeners", () => {
    let clicked = false
    const container = document.createElement("div")
    const dispose = render(
      jsx("button", {
        onClick: () => {
          clicked = true
        },
      }) as HTMLElement,
      container,
    )
    container.querySelector("button")!.click()
    expect(clicked).toBe(true)
    dispose()
  })

  it("calls function components", () => {
    function Greet(props: { name: string }) {
      return jsx("span", { children: `Hello ${props.name}` })
    }
    const el = realize(jsx(Greet as Component, { name: "World" })) as HTMLElement
    expect(el.tagName).toBe("SPAN")
    expect(el.textContent).toBe("Hello World")
  })

  it("renders numbers as text", () => {
    const el = jsx("span", { children: 42 }) as HTMLElement
    expect(el.textContent).toBe("42")
  })

  it("Fragment renders children without wrapper", () => {
    const frag = Fragment({
      children: [jsx("span", { children: "A" }), jsx("span", { children: "B" })],
    })
    const div = jsx("div", { children: frag })
    expect((div as HTMLElement).children.length).toBe(2)
  })

  it("renders signal as text child and updates", async () => {
    const count = createSignal(0)
    const el = jsx("span", { children: count }) as HTMLElement
    expect(el.textContent).toBe("0")
    count.set(5)
    await Promise.resolve()
    expect(el.textContent).toBe("5")
  })

  it("renders signal as prop and updates", async () => {
    const value = createSignal("hello")
    const el = jsx("input", { value }) as HTMLInputElement
    expect(el.value).toBe("hello")
    value.set("world")
    await Promise.resolve()
    expect(el.value).toBe("world")
  })

  it("renders mixed static and signal children", async () => {
    const name = createSignal("World")
    const el = jsx("div", {
      children: ["Hello ", name],
    }) as HTMLElement
    expect(el.textContent).toBe("Hello World")
    name.set("Bun")
    await Promise.resolve()
    expect(el.textContent).toBe("Hello Bun")
  })

  it("applies a function ref to the created element", () => {
    let captured: HTMLElement | null = null
    const el = jsx("div", {
      ref: (node: HTMLElement) => {
        captured = node
      },
    }) as HTMLElement
    expect(captured === el).toBe(true)
  })

  it("assigns to a ref object's current", () => {
    const ref: { current: Element | null } = { current: null }
    const el = jsx("span", { ref }) as HTMLElement
    expect(ref.current).toBe(el)
  })

  it("calls ref cleanup when the node is cleaned up", () => {
    let cleanups = 0
    const el = jsx("div", {
      ref: (node: HTMLElement) => {
        expect(node.tagName).toBe("DIV")
        return () => {
          cleanups++
        }
      },
    }) as HTMLElement
    expect(cleanups).toBe(0)
    cleanupWatchers(el)
    expect(cleanups).toBe(1)
    // cleanup is idempotent: a second pass does not re-run the callback
    cleanupWatchers(el)
    expect(cleanups).toBe(1)
  })

  it("does not treat a ref returning void as cleanup", () => {
    let called = false
    jsx("div", {
      ref: () => {
        called = true
      },
    })
    expect(called).toBe(true)
  })

  it("treats boolean attribute false as removal", () => {
    const el = jsx("button", { disabled: false }) as HTMLButtonElement
    expect(el.hasAttribute("disabled")).toBe(false)
    const on = jsx("button", { disabled: true }) as HTMLButtonElement
    expect(on.hasAttribute("disabled")).toBe(true)
    expect(on.getAttribute("disabled")).toBe("")
  })

  it("removes boolean attribute when signal flips to false", async () => {
    const flag = createSignal(true)
    const el = jsx("input", { disabled: flag }) as HTMLInputElement
    expect(el.hasAttribute("disabled")).toBe(true)
    flag.set(false)
    await Promise.resolve()
    expect(el.hasAttribute("disabled")).toBe(false)
  })

  it("normalizes className to class attribute", () => {
    const el = jsx("div", { className: "foo" }) as HTMLElement
    expect(el.getAttribute("class")).toBe("foo")
  })

  it("applies style object via CSSStyleDeclaration", () => {
    const el = jsx("div", { style: { color: "red", "font-weight": "bold" } }) as HTMLElement
    expect(el.style.color).toBe("red")
    expect(el.style.fontWeight).toBe("bold")
  })

  it("applies style string as attribute", () => {
    const el = jsx("div", { style: "color: blue" }) as HTMLElement
    expect(el.getAttribute("style")).toBe("color: blue")
  })

  it("creates svg elements in the SVG namespace", () => {
    const svg = jsx("svg", { children: jsx("path", { d: "M0 0" }) }) as SVGSVGElement
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")
    const path = svg.firstChild as SVGPathElement
    expect(path.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(path.getAttribute("d")).toBe("M0 0")
  })

  it("maps SVG camelCase presentation attrs to kebab-case", () => {
    const svg = jsx("svg", {
      children: jsx("path", { d: "M0 0", strokeWidth: 2, strokeLinecap: "round" }),
    }) as SVGSVGElement
    const path = svg.firstChild as SVGPathElement
    expect(path.getAttribute("stroke-width")).toBe("2")
    expect(path.getAttribute("stroke-linecap")).toBe("round")
    // Spec-correct camelCase SVG attrs (IDL fallback) keep their casing.
    const svg2 = jsx("svg", { viewBox: "0 0 10 10" }) as SVGSVGElement
    expect(svg2.getAttribute("viewBox")).toBe("0 0 10 10")
  })

  it("signal event handler replaces instead of accumulating", async () => {
    const handlerSig = createSignal<() => void>(() => {})
    const container = document.createElement("div")
    const dispose = render(jsx("div", { onClick: handlerSig }) as HTMLElement, container)
    const el = container.querySelector("div")!
    // Delegated dispatch requires a bubbling event.
    const fire = () => el.dispatchEvent(new window.Event("click", { bubbles: true }))
    let count = 0
    const a = (): void => {
      count++
    }
    const b = (): void => {
      count += 10
    }
    handlerSig.set(a)
    await flush()
    fire()
    expect(count).toBe(1)
    handlerSig.set(b)
    await flush()
    fire()
    // b only — old listener removed, not double-fired
    expect(count).toBe(11)
    dispose()
  })

  it("signal style object removes stale properties on update", async () => {
    const styleSig = createSignal<Record<string, string>>({ color: "red", "font-weight": "bold" })
    const el = jsx("div", { style: styleSig }) as HTMLElement
    expect(el.style.color).toBe("red")
    expect(el.style.fontWeight).toBe("bold")
    styleSig.set({ background: "blue" })
    const { promise, resolve } = Promise.withResolvers<void>()
    queueMicrotask(resolve)
    await promise
    expect(el.style.background).toBe("blue")
    expect(el.style.color).toBe("")
    expect(el.style.fontWeight).toBe("")
  })

  it("signal style switching to a string then null clears object styles", async () => {
    const styleSig = createSignal<Record<string, string> | string | null>({ color: "red" })
    const el = jsx("div", { style: styleSig }) as HTMLElement
    expect(el.style.color).toBe("red")
    styleSig.set("color: blue")
    await flush()
    expect(el.getAttribute("style")).toBe("color: blue")
    styleSig.set(null)
    await flush()
    expect(el.hasAttribute("style")).toBe(false)
  })

  it("skips null/undefined/false/true children", () => {
    const el = jsx("div", {
      children: [null, undefined, false, true, "x"],
    }) as HTMLElement
    expect(el.textContent).toBe("x")
    expect(el.childNodes.length).toBe(1)
  })

  it("falls back to setAttribute when IDL assignment throws (SVG readonly props)", () => {
    // happy-dom 中部分 SVG 属性（如 cx/cy/r）是只读 IDL：赋值抛错时回退属性
    const circle = jsx("circle", { cx: 5, cy: 3, r: 4 }) as SVGCircleElement
    const cx = circle.getAttribute("cx")
    const cy = circle.getAttribute("cy")
    const r = circle.getAttribute("r")
    // 无论走 IDL 还是属性回退，值都必须可读
    expect(String(cx ?? circle.cx)).toBe("5")
    expect(String(cy ?? circle.cy)).toBe("3")
    expect(String(r ?? circle.r)).toBe("4")
  })

  it("normalizes unknown camelCase props to kebab-case attributes", () => {
    const el = jsx("div", { "data-foo-bar": "1", strokeWidth: 2 }) as HTMLElement
    expect(el.getAttribute("data-foo-bar")).toBe("1")
    expect(el.getAttribute("stroke-width")).toBe("2")
  })

  it("Fragment with a signal child stays reactive", async () => {
    const count = createSignal(0)
    const frag = Fragment({ children: count })
    const div = jsx("div", { children: frag }) as HTMLElement
    expect(div.textContent).toBe("0")
    count.set(5)
    await flush()
    expect(div.textContent).toBe("5")
  })
})

describe("binding reliability", () => {
  it("a throwing signal render does not permanently kill the binding", async () => {
    const errors: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => errors.push(e)
    try {
      const count = createSignal<unknown>(1)
      const el = jsx("span", { children: count }) as HTMLElement
      expect(el.textContent).toBe("1")
      // 信号值变成 promise:在 Suspend 外渲染 toNodes 抛错
      count.set(Promise.resolve("x"))
      await flush()
      expect(el.textContent).toBe("1")
      expect(errors.length).toBe(1)
      // 修复前:re-arm 被跳过,one-shot watcher 永久失效,后续更新全丢
      count.set(2)
      await flush()
      expect(el.textContent).toBe("2")
    } finally {
      globalThis.reportError = prevReport
    }
  })

  it("nullish IDL props do not render 'undefined' strings", async () => {
    const input = jsx("input", { value: undefined }) as HTMLInputElement
    expect(input.getAttribute("value")).toBeNull()
    const div = jsx("div", { id: null }) as HTMLElement
    expect(div.getAttribute("id")).toBeNull()
    // 信号驱动路径同样跳过 nullish
    const sig = createSignal<string | undefined>("x")
    const input2 = jsx("input", { value: sig }) as HTMLInputElement
    expect(input2.value).toBe("x")
    sig.set(undefined)
    await flush()
    expect(input2.getAttribute("value")).toBeNull()
    sig.set("y")
    await flush()
    expect(input2.value).toBe("y")
  })
})
