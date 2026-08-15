/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Signal } from "signal-polyfill"
import { jsx, Fragment, Style } from "../src/jsx-runtime"
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

  it("hydrates a signal interleaved with adjacent text", async () => {
    // 回归：SSR 输出 `<!---->0` 与紧随文本在 HTML 解析后合并为一个文本节点，
    // 水合游标按"一个值=一个节点"对齐时错位。需按期望值前缀拆分。
    const container = document.createElement("div")
    const count = createSignal(0)
    const dispose = await ssrThenHydrate(
      () => jsx("p", { children: ["count = ", count, "，doubled = ", count] }),
      container,
    )
    expect(container.textContent).toBe("count = 0，doubled = 0")
    count.set(5)
    await flush()
    expect(container.textContent).toBe("count = 5，doubled = 5")
    count.set(0)
    await flush()
    expect(container.textContent).toBe("count = 0，doubled = 0")
    dispose()
  })

  it("hydrates Show with JSX element branches and swaps them reactively", async () => {
    // 回归：水合模式下 children/fallback 是急切求值的 PendingNode，切换分支时
    // 无法用游标采纳——必须 rebuild 为真实 DOM（此前渲染成 "[object Object]"）。
    const container = document.createElement("div")
    const on = createSignal(true)
    const dispose = await ssrThenHydrate(
      () =>
        Show({
          when: on,
          fallback: jsx("p", { class: "muted", children: "hidden" }),
          children: jsx("p", { class: "on", children: "visible" }),
        }),
      container,
    )
    expect(container.textContent).toBe("visible")
    on.set(false)
    await flush()
    expect(container.textContent).toBe("hidden")
    const fb = container.querySelector("p.muted")!
    expect(fb.textContent).toBe("hidden")
    on.set(true)
    await flush()
    expect(container.textContent).toBe("visible")
    expect(container.querySelector("p.on")!.textContent).toBe("visible")
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

  it("hydrates a still-pending lazy module: adopts SSR content, swaps on settle", async () => {
    const container = document.createElement("div")
    // SSR 阶段：模块已加载，输出 resolved 内容
    const serverCard = lazy(() => Promise.resolve(() => jsx("span", { children: "lazy" })))
    const serverApp = (): Node => Suspend({ fallback: "loading", children: jsx(serverCard, {}) })
    setSSRRuntime(ssrRuntime)
    try {
      container.innerHTML = await renderToFragment(serverApp)
    } finally {
      setSSRRuntime(null)
    }
    expect(container.textContent).toBe("lazy")

    // 客户端：全新 lazy 实例，模块未加载完成（pending）——水合必须静态采纳
    // SSR 内容（无 fallback 闪烁），模块 settle 后再换入客户端节点。
    const { promise, resolve } = Promise.withResolvers<Component>()
    const clientCard = lazy(() => promise)
    const clientApp = (): Node => Suspend({ fallback: "loading", children: jsx(clientCard, {}) })
    const dispose = hydrate(clientApp, container)
    expect(container.textContent).toBe("lazy")
    resolve(() => jsx("span", { children: "client" }))
    await promise
    await flush()
    expect(container.textContent).toBe("client")
    dispose()
  })

  it("hydrates Show rendering its fallback branch from SSR", async () => {
    const container = document.createElement("div")
    const dispose = await ssrThenHydrate(
      () => Show({ when: false, fallback: "off", children: "on" }),
      container,
    )
    expect(container.textContent).toBe("off")
    dispose()
  })

  it("hydrates keyed For passing item accessors", async () => {
    const container = document.createElement("div")
    const list = createSignal([
      { id: 1, v: "a" },
      { id: 2, v: "b" },
    ])
    const dispose = await ssrThenHydrate(
      () =>
        For({
          each: list,
          getKey: item => item.id,
          children: item => {
            // keyed 语义:accessor 必须在绑定中读取(item().v 快照读不会更新);
            // 与客户端 keyed For 测试同构
            const v = new Signal.Computed(() => (item() as { v: string }).v)
            return jsx("li", { children: v })
          },
        }),
      container,
    )
    expect(container.textContent).toBe("ab")
    list.set([
      { id: 1, v: "A" },
      { id: 2, v: "b" },
    ])
    await flush()
    await flush() // keyed 原地更新是两跳:For render → state.set → 绑定 watcher
    expect(container.textContent).toBe("Ab")
    dispose()
  })

  it("hydrates a scoped Style element from SSR output", async () => {
    const container = document.createElement("div")
    const dispose = await ssrThenHydrate(
      () =>
        jsx("main", {
          children: [
            jsx("style", { children: ".card { color: red }" }),
            jsx("p", { class: "card", children: "x" }),
          ],
        }),
      container,
    )
    const styleEl = container.querySelector("style")!
    expect(styleEl.textContent).toMatch(/data-kiko-v\d+/)
    const main = container.firstChild as HTMLElement
    expect(Array.from(main.attributes).some(a => a.name.startsWith("data-kiko-v"))).toBe(true)
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

describe("hydrated reactivity (post-hydration bindings)", () => {
  it("hydrated ErrorBoundary re-runs children when their signals change", async () => {
    const container = document.createElement("div")
    const flag = createSignal(true)
    const dispose = await ssrThenHydrate(
      () =>
        ErrorBoundary({
          children: () =>
            flag.get() ? jsx("p", { children: "on" }) : jsx("p", { children: "off" }),
        }),
      container,
    )
    expect(container.textContent).toBe("on")
    flag.set(false)
    await flush()
    // 修复前:水合后 ErrorBoundary 无 watcher,children 信号变化不重渲染
    expect(container.textContent).toBe("off")
    dispose()
  })

  it("hydrated Suspend re-renders when the children signal changes", async () => {
    const container = document.createElement("div")
    const state = createSignal<unknown>("a")
    const dispose = await ssrThenHydrate(
      () => Suspend({ fallback: jsx("span", { children: "loading" }), children: state }),
      container,
    )
    expect(container.textContent).toBe("a")
    state.set("b")
    await flush()
    // 修复前:水合后 Suspend 不订阅信号,变化被忽略
    expect(container.textContent).toBe("b")
    dispose()
  })

  it("hydrated Show with a direct Style call rebuilds on toggle", async () => {
    const container = document.createElement("div")
    const show = createSignal(true)
    const dispose = await ssrThenHydrate(
      () =>
        jsx("div", {
          children: Show({
            when: show,
            fallback: jsx("span", { children: "off" }),
            children: Style({ children: ".x { color: red }" }),
          }),
        }),
      container,
    )
    expect(container.querySelector("style")).not.toBeNull()
    show.set(false)
    await flush()
    expect(container.textContent).toBe("off")
    show.set(true)
    await flush()
    // 修复前:hydrateStyle 的 PendingNode 无 rebuild → toNodes 兜底成 "[object Object]"
    expect(container.textContent).not.toContain("[object Object]")
    // rebuild 后的 Style 是 constructable sheet 锚点(注释):scope attr 落在 div 上
    const host = container.firstElementChild as HTMLElement
    expect(Array.from(host.attributes).some(a => a.name.startsWith("data-kiko-v"))).toBe(true)
    dispose()
  })
})
