/** @jsxImportSource @kikojs/dom */
/**
 * DocumentFragment 分支值回归。
 *
 * `toNodes` 曾把 DocumentFragment 当成单个 Node 返回(`[frag]`),而 fragment 一旦
 * 插入 DOM 就会把子节点交给父节点、自身变空。于是分支快照里留下的是一个已清空
 * 的 fragment:下一次换出时 `parent.removeChild(frag)` 抛 NotFoundError,For 协调
 * 的 `insertBefore` 同样踩空,界面停在旧内容且不再更新。
 *
 * 覆盖所有经 `toNodes` 物化分支值的路径:Show 静态分支、Suspend fallback、
 * ErrorBoundary fallback、信号子节点、For 条目,以及水合侧的两条物化路径
 * (eager `Fragment()` 分支值的 rebuild、`Suspend` 解析出 fragment)与非
 * constructable 模式下 `Style()` 的 fragment 容器(watcher 必须挂在注释锚点上,
 * 否则展平后 cleanup 够不到它)。
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { jsx, Fragment, Style, cleanupWatchers, toNodes } from "../src/jsx-runtime"
import { Show, For, Suspend, ErrorBoundary } from "../src/flow"
import { createSignal } from "../src/signal"
import { render } from "../src/render"
import { renderToFragment, ssrRuntime } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import { hydrate } from "../src/hydrate"
import { SUSPEND_END_MARKER, SUSPEND_MARKER } from "../src/markers"

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

function mount(tree: Node): HTMLElement {
  const container = document.createElement("div")
  render(tree, container)
  return container
}

describe("DocumentFragment branch values", () => {
  it("Show: fragment fallback, flip false -> true", async () => {
    const cond = createSignal(false)
    const el = mount(
      jsx("div", {
        children: Show({
          when: cond,
          fallback: Fragment({ children: "fallback" }),
          children: jsx("span", { children: "truthy" }),
        }),
      }),
    )
    expect(el.textContent).toBe("fallback")
    cond.set(true)
    await flush()
    await flush()
    expect(el.textContent).toBe("truthy")
  })

  it("Show: fragment children, flip true -> false", async () => {
    const cond = createSignal(true)
    const el = mount(
      jsx("div", {
        children: Show({
          when: cond,
          fallback: jsx("span", { children: "fallback" }),
          children: Fragment({ children: "truthy" }),
        }),
      }),
    )
    expect(el.textContent).toBe("truthy")
    cond.set(false)
    await flush()
    await flush()
    expect(el.textContent).toBe("fallback")
  })

  it("Show: both branches fragments, flip both ways", async () => {
    const cond = createSignal(true)
    const el = mount(
      jsx("div", {
        children: Show({
          when: cond,
          fallback: Fragment({ children: "fallback" }),
          children: Fragment({ children: "truthy" }),
        }),
      }),
    )
    expect(el.textContent).toBe("truthy")
    cond.set(false)
    await flush()
    await flush()
    expect(el.textContent).toBe("fallback")
    cond.set(true)
    await flush()
    await flush()
    expect(el.textContent).toBe("truthy")
  })

  it("Show: nested Show child + fragment fallback", async () => {
    const Panel = () => jsx("div", { children: "panel" })
    const expanded = createSignal(false)
    const editing = createSignal(false)
    const el = mount(
      jsx("div", {
        children: Show({
          when: expanded,
          fallback: Fragment({
            children: [jsx("span", { children: "row view" })],
          }),
          children: jsx(Show, {
            when: editing,
            fallback: jsx(Panel, {}),
            children: jsx("form", { children: "edit" }),
          }),
        }),
      }),
    )
    expect(el.textContent).toBe("row view")
    expanded.set(true)
    await flush()
    await flush()
    expect(el.textContent).toBe("panel")
  })

  it("For: fragment entry removed", async () => {
    const items = createSignal([1, 2])
    const el = mount(
      jsx("ul", {
        children: For({
          each: items,
          children: (n: number) => Fragment({ children: `item ${n}` }),
        }),
      }),
    )
    expect(el.textContent).toBe("item 1item 2")
    items.set([1])
    await flush()
    await flush()
    expect(el.textContent).toBe("item 1")
  })

  it("For: fragment entries reordered", async () => {
    const items = createSignal([1, 2, 3])
    const el = mount(
      jsx("ul", {
        children: For({
          each: items,
          children: (n: number) => Fragment({ children: `item ${n}` }),
        }),
      }),
    )
    items.set([3, 2, 1])
    await flush()
    await flush()
    expect(el.textContent).toBe("item 3item 2item 1")
  })

  it("signal child: fragment value swapped out", async () => {
    const value = createSignal<unknown>(jsx("span", { children: "a" }))
    const el = mount(jsx("div", { children: value }))
    value.set(Fragment({ children: "b" }))
    await flush()
    await flush()
    expect(el.textContent).toBe("b")
    value.set(jsx("span", { children: "c" }))
    await flush()
    await flush()
    expect(el.textContent).toBe("c")
  })

  it("Suspend: fragment fallback swapped out on resolve", async () => {
    const { promise, resolve } = Promise.withResolvers<Node>()
    const el = mount(
      jsx("div", {
        children: Suspend({
          fallback: Fragment({ children: "loading" }),
          children: promise,
        }),
      }),
    )
    expect(el.textContent).toBe("loading")
    resolve(jsx("span", { children: "loaded" }))
    await promise
    await flush()
    await flush()
    expect(el.textContent).toBe("loaded")
  })

  it("ErrorBoundary: fragment fallback then reset back to children", async () => {
    const reset = createSignal<unknown>(undefined)
    let shouldThrow = true
    const el = mount(
      jsx("div", {
        children: ErrorBoundary({
          fallback: Fragment({ children: "caught" }),
          resetSignal: reset,
          children: () => {
            if (shouldThrow) throw new Error("boom")
            return jsx("span", { children: "recovered" })
          },
        }),
      }),
    )
    expect(el.textContent).toBe("caught")
    shouldThrow = false
    reset.set(Symbol("retry"))
    await flush()
    await flush()
    expect(el.textContent).toBe("recovered")
  })

  it("hydrate: fragment branch adopted from SSR then swapped out", async () => {
    // 水合首次采纳走 hydrateValue(游标对齐),但换出/换入走 toNodes——
    // 分支值展平后 SSR 对齐与后续切换必须同时成立。
    setSSRRuntime(ssrRuntime)
    const container = document.createElement("div")
    try {
      container.innerHTML = await renderToFragment(() =>
        Show({
          when: false,
          fallback: Fragment({ children: [jsx("span", { children: "row view" })] }),
          children: jsx("span", { children: "truthy" }),
        }),
      )
    } finally {
      setSSRRuntime(null)
    }
    const cond = createSignal(false)
    const dispose = hydrate(
      () =>
        Show({
          when: cond as never,
          fallback: Fragment({ children: [jsx("span", { children: "row view" })] }),
          children: jsx("span", { children: "truthy" }),
        }),
      container,
    )
    expect(container.textContent).toBe("row view")
    cond.set(true)
    await flush()
    await flush()
    expect(container.textContent).toBe("truthy")
    dispose()
  })

  it("hydrate: eager fragment fallback swapped in after hydration", async () => {
    // 水合期求值的 eager 分支值(`fallback={Fragment(...)}`)是一个待采纳
    // PendingNode;水合结束后的换入必须走 rebuild 重建,不能兜底成
    // "[object Object]" 文本。
    setSSRRuntime(ssrRuntime)
    const container = document.createElement("div")
    try {
      container.innerHTML = await renderToFragment(() =>
        Show({
          when: true,
          fallback: Fragment({ children: [jsx("span", { children: "row view" })] }),
          children: jsx("span", { children: "truthy" }),
        }),
      )
    } finally {
      setSSRRuntime(null)
    }
    const cond = createSignal(true)
    const dispose = hydrate(
      () =>
        Show({
          when: cond as never,
          fallback: Fragment({ children: [jsx("span", { children: "row view" })] }),
          children: jsx("span", { children: "truthy" }),
        }),
      container,
    )
    expect(container.textContent).toBe("truthy")
    cond.set(false)
    await flush()
    await flush()
    expect(container.textContent).toBe("row view")
    cond.set(true)
    await flush()
    await flush()
    expect(container.textContent).toBe("truthy")
    dispose()
  })

  it("hydrate: Suspend promise resolving to a fragment, then swapped out", async () => {
    // 水合期允诺挂着;异步内容在水合栈之后解析为一个客户端构建的 fragment。
    // 首次填充若把它当单个节点存进分支快照,换出时 removeChild 就踩空。
    const container = document.createElement("div")
    container.appendChild(document.createComment(SUSPEND_MARKER))
    container.appendChild(document.createComment(SUSPEND_END_MARKER))

    const { promise, resolve } = Promise.withResolvers<unknown>()
    const child = createSignal<unknown>(promise)
    const errors: unknown[] = []
    const g = globalThis as unknown as { reportError?: unknown }
    const prev = g.reportError
    g.reportError = (e: unknown) => {
      errors.push(e)
    }

    let dispose: () => void = () => {}
    try {
      dispose = hydrate(
        () => Suspend({ fallback: jsx("span", { children: "loading" }), children: child }) as never,
        container,
      )
      const frag = document.createDocumentFragment()
      frag.appendChild(document.createTextNode("A"))
      frag.appendChild(document.createTextNode("B"))
      resolve(frag)
      await promise
      await flush()
      await flush()
      expect(container.textContent).toBe("AB")

      child.set(jsx("b", { children: "C" }))
      await flush()
      await flush()
      expect(container.textContent).toBe("C")
    } finally {
      g.reportError = prev
    }
    dispose()
    expect(errors).toEqual([])
  })

  it("Style fallback mode: swapping the style branch out stops the css watcher", async () => {
    // 非 constructable 模式下 Style() 返回 fragment(注释锚点 + <style>)。展平后
    // watcher 必须仍能被 cleanupWatchers 够到,否则换出后订阅泄漏、css 继续写入
    // 已脱离文档的 <style>。
    const view = document.defaultView as unknown as { CSSStyleSheet?: unknown }
    const saved = view.CSSStyleSheet
    view.CSSStyleSheet = undefined
    try {
      const css = createSignal("a{color:red}")
      const which = createSignal<unknown>(Style({ children: css }))
      const el = mount(jsx("div", { children: which }))
      const styleEl = el.querySelector("style") as HTMLStyleElement
      expect(styleEl.textContent).toContain("a{color:red}")

      which.set(jsx("span", { children: "plain" }))
      await flush()
      await flush()
      expect(el.querySelector("style")).toBeNull()

      css.set("a{color:blue}")
      await flush()
      await flush()
      expect(styleEl.textContent).toContain("a{color:red}")
    } finally {
      view.CSSStyleSheet = saved
    }
  })

  it("Style fallback mode: cleanup of the flattened snapshot retires the css watcher", async () => {
    // 展平后的快照是 [注释锚点, <style>];watcher 必须挂在注释锚点(两种模式一致),
    // 否则 cleanupWatchers(快照节点) 够不到挂在 fragment 上的 watcher → 订阅泄漏。
    // 注意 toNodes(fragment) 只复制引用、不搬走子节点,所以这里 fragment 仍是满的。
    const view = document.defaultView as unknown as { CSSStyleSheet?: unknown }
    const saved = view.CSSStyleSheet
    view.CSSStyleSheet = undefined
    try {
      const css = createSignal("a{color:red}")
      const frag = Style({ children: css }) as DocumentFragment
      const styleEl = frag.querySelector("style") as HTMLStyleElement
      const snapshot = toNodes(frag)
      for (const n of snapshot) cleanupWatchers(n)

      css.set("a{color:blue}")
      await flush()
      await flush()
      expect(styleEl.textContent).toContain("a{color:red}")
    } finally {
      view.CSSStyleSheet = saved
    }
  })

  it("Style fallback mode: reactive css keeps updating after insertion", async () => {
    // 插入会把 fragment 的子节点搬进父节点、fragment 变空:render 不能依赖
    // fragment.lastChild,必须持有 <style> 元素引用。
    const view = document.defaultView as unknown as { CSSStyleSheet?: unknown }
    const saved = view.CSSStyleSheet
    view.CSSStyleSheet = undefined
    try {
      const css = createSignal("a{color:red}")
      const el = mount(jsx("div", { children: Style({ children: css }) }))
      const styleEl = el.querySelector("style") as HTMLStyleElement
      expect(styleEl.textContent).toContain("a{color:red}")

      css.set("a{color:blue}")
      await flush()
      await flush()
      expect(styleEl.textContent).toContain("a{color:blue}")
    } finally {
      view.CSSStyleSheet = saved
    }
  })

  it("control: fragment as a plain element child is fine", () => {
    const el = mount(jsx("div", { children: Fragment({ children: "plain child" }) }))
    expect(el.textContent).toBe("plain child")
  })

  it("control: element branches swap fine", async () => {
    const cond = createSignal(false)
    const el = mount(
      jsx("div", {
        children: Show({
          when: cond,
          fallback: jsx("p", { children: "fallback" }),
          children: jsx("span", { children: "truthy" }),
        }),
      }),
    )
    cond.set(true)
    await flush()
    await flush()
    expect(el.textContent).toBe("truthy")
  })
})
