/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, beforeEach } from "bun:test"
import { Style } from "../src/jsx-runtime"
import { render } from "../src/render"
import { Show, For } from "../src/flow"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

function adoptedRules(): string[] {
  return Array.from(document.adoptedStyleSheets).flatMap(sheet =>
    Array.from(sheet.cssRules).map(rule => rule.cssText),
  )
}

function scopeAttrIn(cssText: string): string {
  const m = /\[(data-kiko-v\d+)\]/.exec(cssText)
  if (m === null) throw new Error(`no scope attr in: ${cssText}`)
  return m[1]!
}

beforeEach(() => {
  // happy-dom shares one document across tests in a file — drop adopted sheets
  const sheets = document.adoptedStyleSheets as unknown as CSSStyleSheet[]
  sheets.length = 0
})

describe("Style — constructable stylesheets", () => {
  it("adopts a sheet and scopes selectors to the containing element", () => {
    const el = (
      <div>
        <Style>{`.card { color: red }`}</Style>
        <p class="card">x</p>
      </div>
    ) as HTMLElement
    expect(document.adoptedStyleSheets.length).toBe(1)
    const [rule] = adoptedRules()
    expect(rule).toMatch(/\[data-kiko-v\d+\] \.card, \[data-kiko-v\d+\]\.card \{ color: red; \}/)
    expect(el.hasAttribute(scopeAttrIn(rule!))).toBe(true)
  })

  it("scopes via the intrinsic <style> spelling", () => {
    const el = (
      <div>
        <style>{`.title { font-weight: bold }`}</style>
        <p class="title">t</p>
      </div>
    ) as HTMLElement
    // intercepted — no <style> element in the DOM, only the adopted sheet
    expect(el.querySelector("style")).toBeNull()
    const [rule] = adoptedRules()
    expect(rule).toMatch(/\[data-kiko-v\d+\] \.title/)
    expect(el.hasAttribute(scopeAttrIn(rule!))).toBe(true)
  })

  it("injects global css unchanged with global", () => {
    const el = (
      <div>
        <Style global>{`body { margin: 0 }`}</Style>
      </div>
    ) as HTMLElement
    expect(adoptedRules()).toEqual(["body { margin: 0px; }"])
    expect(el.getAttributeNames()).toHaveLength(0)
  })

  it("gives each scoped style its own scope attribute", () => {
    const el = (
      <div>
        <Style>{`.a { color: red }`}</Style>
        <Style>{`.b { color: blue }`}</Style>
      </div>
    ) as HTMLElement
    const [a, b] = adoptedRules()
    const attrA = scopeAttrIn(a!)
    const attrB = scopeAttrIn(b!)
    expect(attrA).not.toBe(attrB)
    expect(el.hasAttribute(attrA)).toBe(true)
    expect(el.hasAttribute(attrB)).toBe(true)
  })

  it("rewrites & and pierces :deep / :global", () => {
    const el = (
      <div>
        <Style>{`
          & .sub { color: blue }
          :deep(input) { border: 0 }
          :global(.legacy) { color: gray }
        `}</Style>
      </div>
    ) as HTMLElement
    const [amp, deep, global] = adoptedRules()
    expect(amp).toMatch(/^\[data-kiko-v\d+\] \.sub \{ color: blue; \}$/)
    expect(deep).toBe("input { border: 0px; }")
    expect(global).toBe(".legacy { color: gray; }")
    void el
  })

  it("recurses into @media but leaves @keyframes alone", () => {
    const el = (
      <div>
        <Style>{`
          .a { color: red }
          @media (max-width: 600px) {
            .b { color: blue }
          }
          @keyframes spin {
            from { transform: rotate(0deg) }
            to { transform: rotate(360deg) }
          }
        `}</Style>
      </div>
    ) as HTMLElement
    const [a, media, keyframes] = adoptedRules()
    expect(a).toMatch(/\[data-kiko-v\d+\] \.a/)
    expect(media).toMatch(/@media \(max-width: 600px\)/)
    expect(media).toMatch(/\[data-kiko-v\d+\] \.b/)
    expect(keyframes).toMatch(/@keyframes spin/)
    expect(keyframes).not.toMatch(/data-kiko/)
    void el
  })

  it("re-renders when the css is a signal, keeping the sheet", async () => {
    const css = createSignal(".a { color: red }")
    const el = (
      <div>
        <Style>{css}</Style>
      </div>
    ) as HTMLElement
    const sheet = Array.from(document.adoptedStyleSheets)[0]!
    expect(sheet.cssRules[0]!.cssText).toMatch(/\[data-kiko-v\d+\] \.a/)
    css.set(".b { color: blue }")
    await flush()
    expect(sheet.cssRules[0]!.cssText).toMatch(/\[data-kiko-v\d+\] \.b/)
    expect(document.adoptedStyleSheets.length).toBe(1)
    expect(el.hasAttribute(scopeAttrIn(sheet.cssRules[0]!.cssText))).toBe(true)
  })

  it("un-adopts the sheet when the tree is disposed", () => {
    const container = document.createElement("div")
    const dispose = render(
      <div>
        <Style>{`.a { color: red }`}</Style>
      </div>,
      container,
    )
    expect(document.adoptedStyleSheets.length).toBe(1)
    dispose()
    expect(document.adoptedStyleSheets.length).toBe(0)
  })

  it("re-adopts the sheet when Show remounts the subtree", async () => {
    const show = createSignal(true)
    const el = (
      <div>
        <Show when={show}>
          <Style>{`.item { color: red }`}</Style>
        </Show>
        <p class="item">x</p>
      </div>
    ) as HTMLElement
    const first = scopeAttrIn(adoptedRules()[0]!)
    expect(el.hasAttribute(first)).toBe(true)
    show.set(false)
    await flush()
    // 保留式分支:隐藏分支的 watcher/sheet 保持存活(换回后样式直接可用),
    // 不再在切换时 un-adopt
    expect(document.adoptedStyleSheets.length).toBe(1)
    show.set(true)
    await flush()
    expect(document.adoptedStyleSheets.length).toBe(1)
    // same anchor, same scope attr, same sheet — kept alive across toggles
    expect(scopeAttrIn(adoptedRules()[0]!)).toBe(first)
    expect(el.hasAttribute(first)).toBe(true)
  })

  it("keeps scoping content re-rendered by a keyed For", async () => {
    const items = createSignal([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ])
    const el = (
      <div>
        <Style>{`.row { color: red }`}</Style>
        <For each={items} getKey={item => item.id}>
          {item => <p class="row">{item().name}</p>}
        </For>
      </div>
    ) as HTMLElement
    const attr = scopeAttrIn(adoptedRules()[0]!)
    expect(el.hasAttribute(attr)).toBe(true)
    items.set([
      { id: 1, name: "a" },
      { id: 3, name: "c" },
    ])
    await flush()
    expect(el.hasAttribute(attr)).toBe(true)
    expect(el.querySelectorAll(".row").length).toBe(2)
  })
})

describe("Style — fallback", () => {
  it("renders a <style> element when constructable sheets are unavailable", () => {
    const view = document.defaultView as unknown as { CSSStyleSheet?: unknown }
    const saved = view.CSSStyleSheet
    try {
      view.CSSStyleSheet = undefined
      const el = (
        <div>
          <Style>{`.a { color: red }`}</Style>
        </div>
      ) as HTMLElement
      const styleEl = el.querySelector("style")!
      expect(styleEl.textContent).toMatch(/\[data-kiko-v\d+\] \.a/)
      expect(el.hasAttribute(scopeAttrIn(styleEl.textContent!))).toBe(true)
      expect(document.adoptedStyleSheets.length).toBe(0)
    } finally {
      view.CSSStyleSheet = saved
    }
  })

  it("passes nonce to fallback <style> element", () => {
    const view = document.defaultView as unknown as { CSSStyleSheet?: unknown }
    const saved = view.CSSStyleSheet
    try {
      view.CSSStyleSheet = undefined
      const el = (
        <div>
          <Style nonce="client-nonce">{`.a { color: red }`}</Style>
        </div>
      ) as HTMLElement
      const styleEl = el.querySelector("style")!
      expect(styleEl.getAttribute("nonce")).toBe("client-nonce")
      expect(styleEl.textContent).toMatch(/\[data-kiko-v\d+\] \.a/)
    } finally {
      view.CSSStyleSheet = saved
    }
  })
})

describe("regression — intrinsic <style global>", () => {
  it("adopts global css unscoped", () => {
    const el = (
      <div>
        <style global>{`body { margin: 0 }`}</style>
      </div>
    ) as HTMLElement
    // intercepted — no <style> element in the DOM, only the adopted sheet
    expect(el.querySelector("style")).toBeNull()
    expect(adoptedRules()).toEqual(["body { margin: 0px; }"])
    expect(el.getAttributeNames()).toHaveLength(0)
  })
})
