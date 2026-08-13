/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { jsx, Fragment } from "../src/jsx-runtime"
import { createContext, useContext } from "../src/context"
import { createSignal } from "../src/signal"
import { Show, For } from "../src/flow"
import { renderToFragment, ssrRuntime } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import type { WatchableSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("createContext / useContext — 提供与读取", () => {
  it("works as a JSX tag (React 19 style)", () => {
    const Theme = createContext<string>("light")
    const Label = () => <em>{useContext(Theme)}</em>
    const el = (
      <div>
        <Theme value="dark">{() => <Label />}</Theme>
      </div>
    ) as HTMLElement
    expect(el.querySelector("em")?.textContent).toBe("dark")
  })

  it("provides the value to consumers inside the provider", () => {
    const Theme = createContext<string>("light")
    const Label = () => jsx("em", { children: useContext(Theme) })
    const el = jsx("div", {
      children: jsx(Theme, { value: "dark", children: () => jsx(Label, {}) }),
    }) as HTMLElement
    expect(el.querySelector("em")?.textContent).toBe("dark")
  })

  it("returns the default value when no provider is in scope", () => {
    const Theme = createContext<string>("light")
    const Label = () => jsx("em", { children: useContext(Theme) })
    const el = jsx("div", { children: jsx(Label, {}) }) as HTMLElement
    expect(el.querySelector("em")?.textContent).toBe("light")
  })

  it("returns undefined when there is no default and no provider", () => {
    const NoDefault = createContext<string>()
    const Label = () => jsx("em", { children: String(useContext(NoDefault)) })
    const el = jsx("div", { children: jsx(Label, {}) }) as HTMLElement
    expect(el.querySelector("em")?.textContent).toBe("undefined")
  })

  it("nearest provider wins and outer value is restored after exit", () => {
    const Theme = createContext("light")
    const Label = () => jsx("em", { children: useContext(Theme) })
    const el = jsx("div", {
      children: jsx(Theme, {
        value: "outer",
        children: () => [
          jsx("span", {
            id: "inner",
            children: jsx(Theme, { value: "inner", children: () => jsx(Label, {}) }),
          }),
          jsx("span", { id: "outer", children: jsx(Label, {}) }),
        ],
      }),
    }) as HTMLElement
    expect(el.querySelector("#inner em")?.textContent).toBe("inner")
    expect(el.querySelector("#outer em")?.textContent).toBe("outer")
  })

  it("keeps independent contexts isolated", () => {
    const A = createContext("a0")
    const B = createContext("b0")
    const ReadBoth = () => jsx("em", { children: `${useContext(A)}|${useContext(B)}` })
    const el = jsx("div", {
      children: jsx(A, {
        value: "a1",
        children: () => jsx(B, { value: "b1", children: () => jsx(ReadBoth, {}) }),
      }),
    }) as HTMLElement
    expect(el.querySelector("em")?.textContent).toBe("a1|b1")
  })

  it("sibling providers balance the stack independently", () => {
    const Theme = createContext("light")
    const Label = () => jsx("em", { children: useContext(Theme) })
    const el = jsx("div", {
      children: [
        jsx(Theme, { value: "a", children: () => jsx(Label, {}) }),
        jsx(Theme, { value: "b", children: () => jsx(Label, {}) }),
      ],
    }) as HTMLElement
    expect(el.querySelectorAll("em")[0]?.textContent).toBe("a")
    expect(el.querySelectorAll("em")[1]?.textContent).toBe("b")
  })

  it("mounts as the root of render()", async () => {
    const { render } = await import("../src/render")
    const Theme = createContext("dark")
    const Label = () => jsx("em", { children: useContext(Theme) })
    const container = document.createElement("div")
    render(jsx(Theme, { value: "dark", children: () => jsx(Label, {}) }) as Node, container)
    expect(container.textContent).toBe("dark")
  })

  it("returns fragment and array children unchanged", () => {
    const Theme = createContext("x")
    const el = jsx("div", {
      children: jsx(Theme, {
        value: "x",
        children: () =>
          jsx(Fragment, { children: [jsx("i", { children: "a" }), jsx("b", { children: "b" })] }),
      }),
    }) as HTMLElement
    expect(el.querySelector("i")?.textContent).toBe("a")
    expect(el.querySelector("b")?.textContent).toBe("b")
  })

  it("throws when children are eager values instead of a function", () => {
    const Theme = createContext("light")
    expect(() => jsx(Theme, { value: "dark", children: jsx("div", {}) })).toThrow(TypeError)
    expect(() => jsx(Theme, { value: "dark" })).toThrow(TypeError)
  })
})

describe("createContext — 响应式值", () => {
  it("binds a signal value to props reactively", async () => {
    const Theme = createContext<WatchableSignal<string>>()
    const theme = createSignal("dark")
    const Label = () => {
      const t = useContext(Theme)!
      return jsx("div", { class: t })
    }
    const el = jsx(Theme, { value: theme, children: () => jsx(Label, {}) }) as HTMLElement
    expect(el.getAttribute("class")).toBe("dark")
    theme.set("light")
    await flush()
    expect(el.getAttribute("class")).toBe("light")
  })
})

describe("createContext — 与控制流组合", () => {
  it("is visible inside Show deferred children", async () => {
    const Theme = createContext("light")
    const Label = () => jsx("em", { children: useContext(Theme) })
    const visible = createSignal(true)
    const el = jsx("div", {
      children: jsx(Theme, {
        value: "dark",
        children: () => jsx(Show, { when: visible, children: () => jsx(Label, {}) }),
      }),
    }) as HTMLElement
    expect(el.querySelector("em")?.textContent).toBe("dark")
    visible.set(false)
    await flush()
    expect(el.querySelector("em")).toBeNull()
  })

  it("is visible inside For deferred children", () => {
    const Theme = createContext("dark")
    const Label = () => jsx("em", { children: useContext(Theme) })
    const list = createSignal([1, 2, 3])
    const el = jsx("div", {
      children: jsx(Theme, {
        value: "dark",
        children: () => jsx(For, { each: list, children: () => jsx(Label, {}) }),
      }),
    }) as HTMLElement
    expect(el.querySelectorAll("em").length).toBe(3)
    for (const em of el.querySelectorAll("em")) expect(em.textContent).toBe("dark")
  })
})

describe("createContext — SSR", () => {
  beforeAll(() => setSSRRuntime(ssrRuntime))
  afterAll(() => setSSRRuntime(null))

  it("renders the provided value to a fragment", async () => {
    const Theme = createContext("light")
    const Label = () => jsx("em", { children: useContext(Theme) })
    expect(
      await renderToFragment(() =>
        jsx(Theme, { value: "midnight", children: () => jsx(Label, {}) }),
      ),
    ).toBe("<em>midnight</em>")
  })

  it("renders the default when no provider wraps the SSR tree", async () => {
    const Theme = createContext("light")
    const Label = () => jsx("em", { children: useContext(Theme) })
    expect(await renderToFragment(() => jsx(Label, {}))).toBe("<em>light</em>")
  })
})
