/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { jsx, Fragment } from "../src/jsx-runtime"
import { Show, For, ErrorBoundary, Suspend } from "../src/flow"
import { lazy } from "../src/lazy"
import { renderToFragment, ssrRuntime } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import { hydrate } from "../src/hydrate"
import { createSignal } from "../src/signal"
import type { Component } from "../src/jsx-runtime"

beforeAll(async () => {
  await import("./setup")
})

afterAll(() => {
  setSSRRuntime(null)
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

/** SSR 产出 HTML → 填入容器 → 关闭 SSR 运行时 → 客户端水合 */
async function ssrThenHydrate(root: () => unknown, container: Element): Promise<() => void> {
  setSSRRuntime(ssrRuntime)
  try {
    container.innerHTML = await renderToFragment(root)
  } finally {
    setSSRRuntime(null)
  }
  return hydrate(root, container)
}

describe("hydrate", () => {
  it("adopts SSR html and attaches event listeners", async () => {
    const container = document.createElement("div")
    const clicks = createSignal(0)
    const App = (): Node =>
      jsx("button", {
        onClick: () => clicks.set(clicks.get() + 1),
        children: "go",
      })
    const dispose = await ssrThenHydrate(() => App(), container)
    expect(container.innerHTML).toBe(`<button>go</button>`)
    container
      .querySelector("button")!
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
    expect(clicks.get()).toBe(1)
    dispose()
  })

  it("binds signal children", async () => {
    const container = document.createElement("div")
    const count = createSignal(2)
    const dispose = await ssrThenHydrate(() => jsx("p", { children: count }), container)
    expect(container.textContent).toBe("2")
    count.set(3)
    await flush()
    expect(container.textContent).toBe("3")
    dispose()
  })

  it("binds signal props", async () => {
    const container = document.createElement("div")
    const theme = createSignal("light")
    const dispose = await ssrThenHydrate(
      () => jsx("div", { class: theme, children: "x" }),
      container,
    )
    expect((container.firstChild as HTMLElement).className).toBe("light")
    theme.set("dark")
    await flush()
    expect((container.firstChild as HTMLElement).className).toBe("dark")
    dispose()
  })

  it("adopts escaped text", async () => {
    const container = document.createElement("div")
    const dispose = await ssrThenHydrate(() => jsx("p", { children: `1 < 2 & 3` }), container)
    expect(container.textContent).toBe("1 < 2 & 3")
    dispose()
  })

  it("hydrates nested components and fragments", async () => {
    const container = document.createElement("div")
    const Inner = (): Node => jsx("b", { children: "inner" })
    const dispose = await ssrThenHydrate(
      () => Fragment({ children: [jsx("i", { children: "a" }), Inner()] }),
      container,
    )
    expect(container.textContent).toBe("ainner")
    dispose()
  })

  it("hydrates Show and toggles reactively", async () => {
    const container = document.createElement("div")
    const on = createSignal(true)
    const dispose = await ssrThenHydrate(
      () => Show({ when: on, fallback: "off", children: "on" }),
      container,
    )
    expect(container.textContent).toBe("on")
    on.set(false)
    await flush()
    expect(container.textContent).toBe("off")
    on.set(true)
    await flush()
    expect(container.textContent).toBe("on")
    dispose()
  })

  it("hydrates For and re-renders on each change", async () => {
    const container = document.createElement("div")
    const list = createSignal(["a", "b"])
    const dispose = await ssrThenHydrate(
      () => For({ each: list, children: item => jsx("li", { children: item }) }),
      container,
    )
    expect(container.textContent).toBe("ab")
    list.set(["a", "b", "c"])
    await flush()
    expect(container.textContent).toBe("abc")
    dispose()
  })

  it("hydrates ErrorBoundary fallback", async () => {
    const container = document.createElement("div")
    const Boom = (): Node => {
      throw new Error("boom")
    }
    const dispose = await ssrThenHydrate(
      () =>
        ErrorBoundary({
          fallback: "fallback",
          children: () => jsx(Boom, {}),
        }),
      container,
    )
    expect(container.textContent).toBe("fallback")
    dispose()
  })

  it("hydrates Suspend and swaps in client content from a lazy module", async () => {
    const container = document.createElement("div")
    const { promise, resolve } = Promise.withResolvers<Component>()
    const Card = lazy(() => promise)
    const App = (): Node => Suspend({ fallback: "loading", children: jsx(Card, {}) })
    // 先落定模块：SSR 时组件产出字符串，客户端水合后产出真实节点并换入
    resolve(() => jsx("span", { children: "lazy" }))
    const dispose = await ssrThenHydrate(() => App(), container)
    expect(container.innerHTML).toContain("<!--suspend-->")
    expect(container.textContent).toBe("lazy")
    dispose()
  })

  it("dispose cleans up watchers", async () => {
    const container = document.createElement("div")
    const count = createSignal(1)
    const dispose = await ssrThenHydrate(() => jsx("p", { children: count }), container)
    dispose()
    count.set(99)
    await flush()
    expect(container.textContent).toBe("1")
  })
})
