import { describe, it, expect, beforeAll, beforeEach } from "bun:test"
import { dom, htm } from "../src/htm"
import { Fragment } from "../src/jsx-runtime"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

beforeEach(() => {
  const sheets = document.adoptedStyleSheets as unknown as CSSStyleSheet[]
  sheets.length = 0
})

describe("dom tagged template", () => {
  it("renders elements with static attributes and text", () => {
    const el = dom`<div class="card" id="a">hello</div>` as HTMLElement
    expect(el.tagName).toBe("DIV")
    expect(el.getAttribute("class")).toBe("card")
    expect(el.id).toBe("a")
    expect(el.textContent).toBe("hello")
  })

  it("interpolates attribute values", () => {
    const el = dom`<div class=${"active"} title=${"t"}>x</div>` as HTMLElement
    expect(el.getAttribute("class")).toBe("active")
    expect(el.getAttribute("title")).toBe("t")
  })

  it("interpolates children — nodes, arrays and signals", async () => {
    const span = dom`<span>s</span>`
    const el = dom`<div>${span}</div>` as HTMLElement
    expect(el.querySelector("span")?.textContent).toBe("s")

    const items = [dom`<i>1</i>`, dom`<i>2</i>`]
    const ul = dom`<ul>${items}</ul>` as HTMLElement
    expect(ul.querySelectorAll("i").length).toBe(2)

    const sig = createSignal("hi")
    const p = dom`<p>${sig}</p>` as HTMLElement
    expect(p.textContent).toBe("hi")
    sig.set("yo")
    await flush()
    expect(p.textContent).toBe("yo")
  })

  it("supports components with props and children", () => {
    const Card = (props: { name?: string; children?: unknown }): Node =>
      dom`<div class="card">${props.children}<b>${props.name}</b></div>`
    const el = dom`<${Card} name=${"kiko"}>hi</${Card}>` as HTMLElement
    expect(el.className).toBe("card")
    expect(el.textContent).toBe("hikiko")
  })

  it("supports Fragment tags and returns fragments for multi-root templates", () => {
    const frag = dom`<${Fragment}><p>a</p></${Fragment}>`
    expect(frag).toBeInstanceOf(DocumentFragment)
    expect(frag.textContent).toBe("a")

    const multi = dom`<span>a</span><span>b</span>`
    expect(multi).toBeInstanceOf(DocumentFragment)
    expect(multi.childNodes.length).toBe(2)
  })

  it("drops newline-anchored whitespace like JSX", () => {
    const el = dom`<div>
      <p>x</p>
    </div>` as HTMLElement
    expect(el.childNodes.length).toBe(1)
    expect(el.textContent).toBe("x")
    // inline whitespace survives
    const p = dom`<p>a b</p>` as HTMLElement
    expect(p.textContent).toBe("a b")
  })

  it("preserves tag case for SVG", () => {
    const svg = dom`<svg viewBox="0 0 10 10"><linearGradient id="g"/></svg>` as SVGSVGElement
    expect(svg.tagName).toBe("svg")
    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10")
    expect(svg.firstChild?.nodeName).toBe("linearGradient")
  })

  it("routes <style> through the Style component (scoped by default)", () => {
    const el =
      dom`<div><style>.card { color: red }</style><p class="card">x</p></div>` as HTMLElement
    expect(el.querySelector("style")).toBeNull()
    const rules = Array.from(document.adoptedStyleSheets).flatMap(s =>
      Array.from(s.cssRules).map(r => r.cssText),
    )
    expect(rules[0]).toMatch(/\[data-kiko-v\d+\] \.card/)
    const attr = /\[(data-kiko-v\d+)\]/.exec(rules[0]!)![1]!
    expect(el.hasAttribute(attr)).toBe(true)
  })

  it("stringifies interpolations inside quoted attribute values", () => {
    const el = dom`<div title="a ${"b"} c"/>` as HTMLElement
    expect(el.getAttribute("title")).toBe("a b c")
  })

  it("supports ...${props} spreads and boolean attributes", () => {
    const el = dom`<div ...${{ id: "x", class: "y" }} disabled/>` as HTMLElement
    expect(el.id).toBe("x")
    expect(el.getAttribute("class")).toBe("y")
    expect(el.hasAttribute("disabled")).toBe(true)
  })

  it("binds event props and object styles", () => {
    let clicks = 0
    const btn = dom`<button onClick=${() => {
      clicks++
    }}>go</button>` as HTMLButtonElement
    btn.click()
    expect(clicks).toBe(1)
    const el = dom`<div style=${{ color: "red" }}/>` as HTMLElement
    expect(el.style.color).toBe("red")
  })

  it("skips comments", () => {
    const el = dom`<div><!-- skip -->x</div>` as HTMLElement
    expect(el.textContent).toBe("x")
  })

  it("accepts dynamic string tags and renders numbers", () => {
    const el = dom`<${"div"} class="x"/>` as HTMLElement
    expect(el.tagName).toBe("DIV")
    const p = dom`<p>${42}</p>` as HTMLElement
    expect(p.textContent).toBe("42")
  })
})

describe("htm alias", () => {
  it("behaves identically to dom", () => {
    const el = htm`<span class="x">y</span>` as HTMLElement
    expect(el.tagName).toBe("SPAN")
    expect(el.getAttribute("class")).toBe("x")
    expect(el.textContent).toBe("y")
  })
})
