/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Signal } from "signal-polyfill"
import { jsx, Fragment, Style } from "../src/jsx-runtime"
import { Show, For, ErrorBoundary, Suspend } from "../src/flow"
import { lazy } from "../src/lazy"
import { renderToFragment, ssrRuntime } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import { hydrate, hydrateWithState } from "../src/hydrate"
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

  it("reuses hydrated nodes for object items on reorder", async () => {
    const container = document.createElement("div")
    const a = { id: 1 }
    const b = { id: 2 }
    const list = createSignal([a, b])
    const dispose = await ssrThenHydrate(
      () =>
        For({ each: list, children: (item: { id: number }) => jsx("li", { children: item.id }) }),
      container,
    )
    expect(container.textContent).toBe("12")
    list.set([b, a])
    await flush()
    // 水合采纳的节点按引用复用,顺序跟随数据
    expect(container.textContent).toBe("21")
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

  it("strict mode throws on mismatch instead of warn", async () => {
    const container = document.createElement("div")
    // SSR:真分支 <b>on</b>;客户端初始 when=false → fallback 文本错位
    container.innerHTML = "<!--show--><b>on</b>"
    const on = createSignal(false)
    expect(() =>
      hydrate(
        () => Show({ when: on, fallback: "off", children: jsx("b", { children: "on" }) }),
        container,
        { strict: true },
      ),
    ).toThrow(/expected text node/)
  })

  it("mismatch warnings carry position and element context", async () => {
    const container = document.createElement("div")
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    try {
      // SSR: <b>42</b>;客户端渲染 <b>43</b> → b 内文本错位
      container.innerHTML = "<div><b>42</b></div>"
      const dispose = hydrate(() => jsx("div", { children: jsx("b", { children: 43 }) }), container)
      dispose()
    } finally {
      console.error = orig
    }
    const msg = errors.join("\n")
    expect(msg).toContain("text mismatch")
    expect(msg).toContain("inside <div><b>")
    expect(msg).toContain("at node")
  })

  it("warns when the container embeds signal state but hydrate() is used", async () => {
    const container = document.createElement("div")
    container.innerHTML =
      '<div><!---->42</div><script id="kiko-state" type="application/json">[42]</script>'
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    try {
      const dispose = hydrate(() => jsx("div", { children: createSignal(0) }), container)
      dispose()
    } finally {
      console.error = orig
    }
    expect(errors.join("\n")).toContain("use hydrateWithState")
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

  it("hydrates keyed For: append keeps surviving nodes attached (D4)", async () => {
    const container = document.createElement("div")
    const list = createSignal([{ id: 1 }, { id: 2 }])
    const dispose = await ssrThenHydrate(
      () =>
        For({
          each: list,
          getKey: item => item.id,
          children: item => {
            const id = new Signal.Computed(() => item().id)
            return jsx("li", { children: jsx("span", { children: id }) })
          },
        }),
      container,
    )
    const lis = Array.from(container.querySelectorAll("li"))
    expect(lis.map(n => n.textContent)).toEqual(["1", "2"])

    list.set([{ id: 1 }, { id: 2 }, { id: 3 }])
    await flush()
    const after = Array.from(container.querySelectorAll("li"))
    expect(after.map(n => n.textContent)).toEqual(["1", "2", "3"])
    // 存活条目的节点是同一引用,未被拆除重挂
    expect(after[0]).toBe(lis[0])
    expect(after[1]).toBe(lis[1])
    dispose()
  })

  it("hydrates For with duplicate items: adopts every entry, rebuilds on duplicate update", async () => {
    const container = document.createElement("div")
    const list = createSignal(["x", "x"])
    const dispose = await ssrThenHydrate(
      () => For({ each: list, children: item => jsx("li", { children: item }) }),
      container,
    )
    // 采纳期游标逐项消费:重复条目也各得节点
    expect(container.querySelectorAll("li").length).toBe(2)

    list.set(["x"])
    await flush()
    expect(container.textContent).toBe("x")

    // 更新期出现重复身份 → 回退整表重建(全部新节点)
    const before = Array.from(container.querySelectorAll("li"))
    list.set(["x", "x"])
    await flush()
    const after = Array.from(container.querySelectorAll("li"))
    expect(after.map(n => n.textContent)).toEqual(["x", "x"])
    expect(after[0]).not.toBe(before[0])
    dispose()
  })

  it("hydrates Show: static branches keep node identity across toggles", async () => {
    const container = document.createElement("div")
    const on = createSignal(true)
    const dispose = await ssrThenHydrate(
      () => Show({ when: on, fallback: "off", children: jsx("b", { children: "on" }) }),
      container,
    )
    const b = container.querySelector("b")!
    expect(container.textContent).toBe("on")
    on.set(false)
    await flush()
    expect(container.textContent).toBe("off")
    on.set(true)
    await flush()
    // 静态分支换出保留 watcher,换回复用同一节点(绑定仍存活)
    expect(container.querySelector("b")).toBe(b)
    dispose()
  })

  it("hydrates Suspend whose signal value is a mixed array", async () => {
    const container = document.createElement("div")
    const { promise, resolve } = Promise.withResolvers<Node>()
    const state = createSignal<unknown>(["a", promise])
    // 手写 SSR 产物结构(流式模式下未决 promise 会先输出 fallback;
    // renderToFragment 会 await 未决 promise,无法在测试里直接产出该结构)
    container.innerHTML = "<!--suspend-->loading<!--/suspend-->"
    const dispose = hydrate(() => Suspend({ fallback: "loading", children: state }), container)
    // 初始 settle:数组含未决 promise → 保留已采纳的 fallback 内容
    expect(container.textContent).toBe("loading")
    resolve(jsx("b", { children: "async" }))
    await promise
    await flush()
    // settle 后换入混合数组:同步项 + 已解析节点
    expect(container.textContent).toBe("aasync")
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

  it("fires a component ref with the adopted root element", async () => {
    const container = document.createElement("div")
    const seen: Element[] = []
    const Card = (): Node => jsx("article", { children: jsx("h2", { children: "t" }) })
    // ref 是 jsx 层属性：水合期推迟到元素采纳完成后触发
    const dispose = await ssrThenHydrate(
      () => jsx(Card, { ref: (el: Element) => void seen.push(el) }),
      container,
    )
    expect(seen.length).toBe(1)
    expect((seen[0] as HTMLElement).tagName).toBe("ARTICLE")
    dispose()
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

describe("hydrate exception paths", () => {
  it("hydrated ErrorBoundary catches signal-driven errors and retries via reset", async () => {
    const container = document.createElement("div")
    const flag = createSignal(0)
    const reset = createSignal(0)
    const dispose = await ssrThenHydrate(
      () =>
        ErrorBoundary({
          resetSignal: reset,
          fallback: "fb",
          children: () => {
            const v = flag.get()
            if (v === 2) throw new Error("boom")
            return jsx("p", { children: `v=${v}` })
          },
        }),
      container,
    )
    expect(container.textContent).toBe("v=0")

    flag.set(2)
    await flush()
    expect(container.textContent).toBe("fb")

    flag.set(3)
    reset.set(1)
    await flush()
    await flush()
    expect(container.textContent).toBe("v=3")
    dispose()
  })

  it("hydrated ErrorBoundary supports a function fallback", async () => {
    const container = document.createElement("div")
    const Boom = (): Node => {
      throw new Error("boom")
    }
    const dispose = await ssrThenHydrate(
      () =>
        ErrorBoundary({
          fallback: (e: unknown) => `err:${(e as Error).message}`,
          children: () => jsx(Boom, {}),
        }),
      container,
    )
    expect(container.textContent).toBe("err:boom")
    dispose()
  })

  it("hydrated Suspend keeps fallback on rejection", async () => {
    const reported: unknown[] = []
    const originalReportError = globalThis.reportError
    // @ts-ignore
    globalThis.reportError = (e: unknown) => {
      reported.push(e)
    }
    try {
      const { promise, reject } = Promise.withResolvers<Node>()
      const state = createSignal<unknown>(promise)
      reject(new Error("boom"))
      const container = document.createElement("div")
      const dispose = await ssrThenHydrate(
        () => Suspend({ fallback: "loading", children: state }),
        container,
      )
      expect(container.textContent).toBe("loading")
      await flush()
      expect(container.textContent).toBe("loading")
      expect(reported.length).toBeGreaterThan(0)
      expect((reported[0] as Error).message).toBe("boom")
      dispose()
    } finally {
      // @ts-ignore
      globalThis.reportError = originalReportError
    }
  })

  it("hydrated Suspend discards stale resolved promises when the signal changes", async () => {
    const container = document.createElement("div")
    const state = createSignal<unknown>("a")
    const dispose = await ssrThenHydrate(
      () => Suspend({ fallback: "loading", children: state }),
      container,
    )
    expect(container.textContent).toBe("a")

    const { promise: first, resolve: resolveFirst } = Promise.withResolvers<Node>()
    const { promise: second, resolve: resolveSecond } = Promise.withResolvers<Node>()

    state.set(first)
    await flush()
    expect(container.textContent).toBe("loading")

    state.set(second)
    await flush()
    expect(container.textContent).toBe("loading")

    resolveFirst(jsx("span", { children: "stale" }))
    await first
    await flush()
    expect(container.textContent).toBe("loading")

    resolveSecond(jsx("span", { children: "fresh" }))
    await second
    await flush()
    expect(container.textContent).toBe("fresh")
    dispose()
  })

  it("reuses cached fallback nodes across pending cycles, keeping bindings alive", async () => {
    const container = document.createElement("div")
    const state = createSignal<unknown>("a")
    const fallbackState = createSignal("F1")
    const dispose = await ssrThenHydrate(
      () => Suspend({ fallback: jsx("span", { children: fallbackState }), children: state }),
      container,
    )
    expect(container.textContent).toBe("a")

    const { promise: p1, resolve: resolve1 } = Promise.withResolvers<Node>()
    state.set(p1)
    await flush()
    const loadingSpan = container.querySelector("span")!
    expect(container.textContent).toBe("F1")

    // 缓存的 fallback 内部信号绑定存活
    fallbackState.set("F2")
    await flush()
    expect(loadingSpan.textContent).toBe("F2")

    resolve1(jsx("span", { children: "resolved" }))
    await p1
    await flush()
    expect(container.textContent).toBe("resolved")

    // 第二轮 pending 复用同一批 fallback 节点(身份复用,非重新物化)
    const { promise: p2 } = Promise.withResolvers<Node>()
    state.set(p2)
    await flush()
    expect(container.querySelector("span")).toBe(loadingSpan)
    expect(container.textContent).toBe("F2")

    // dispose 清理隐藏的缓存 fallback(绑定停止,不泄漏)
    dispose()
    fallbackState.set("F3")
    await flush()
    expect(loadingSpan.textContent).toBe("F2")
  })

  it("materializes a lazy component fallback via rebuild without consuming the cursor", async () => {
    const container = document.createElement("div")
    const state = createSignal<unknown>("a")
    const Spinner: Component = () => jsx("span", { children: "loading" })
    const dispose = await ssrThenHydrate(
      () => Suspend({ fallback: jsx(Spinner, {}), children: state }),
      container,
    )
    expect(container.textContent).toBe("a")

    const { promise, resolve } = Promise.withResolvers<Node>()
    state.set(promise)
    await flush()
    // 修复前:toNodes(KikoLazy→PendingNode) 字符串化或消费水合游标
    expect(container.textContent).toBe("loading")

    resolve(jsx("span", { children: "done" }))
    await promise
    await flush()
    expect(container.textContent).toBe("done")
    dispose()
  })
})

describe("水合边界", () => {
  it("empty-string signal snapshot does not warn or steal following sibling", async () => {
    const container = document.createElement("div")
    const s = createSignal("")
    const bold = (): Node => jsx("b", { children: "bold" })
    setSSRRuntime(ssrRuntime)
    container.innerHTML = await renderToFragment(() => jsx("p", { children: [s, bold()] }))
    setSSRRuntime(null)
    expect(container.innerHTML).toBe("<p><!----><b>bold</b></p>")
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    const dispose = hydrate(() => jsx("p", { children: [s, bold()] }), container)
    console.error = orig
    expect(errors.filter(e => e.includes("expected text node")).length).toBe(0)
    expect(container.textContent).toBe("bold")
    s.set("x")
    await flush()
    expect(container.textContent).toBe("xbold")
    dispose()
  })

  it("backfills text on mismatch, keeps client truth, and warns", async () => {
    const container = document.createElement("div")
    setSSRRuntime(ssrRuntime)
    const server = createSignal(5)
    container.innerHTML = await renderToFragment(() => jsx("p", { children: server }))
    setSSRRuntime(null)
    const client = createSignal(6)
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    const dispose = hydrate(() => jsx("p", { children: client }), container)
    console.error = orig
    expect(errors.some(e => e.startsWith("[kiko hydrate] text mismatch"))).toBe(true)
    // 客户端为准回填，避免静默保留过期的 SSR 内容
    expect(container.textContent).toBe("6")
    client.set(7)
    await flush()
    expect(container.textContent).toBe("7")
    dispose()
  })
})

describe("hydrateWithState — 信号状态恢复", () => {
  it("从序列化状态恢复信号初始值后水合", async () => {
    const container = document.createElement("div")
    // 服务端渲染时信号值为 42
    setSSRRuntime(ssrRuntime)
    const server = createSignal(42)
    container.innerHTML = await renderToFragment(() => jsx("div", { children: server }))
    setSSRRuntime(null)
    expect(container.innerHTML).toBe("<div><!---->42</div>")

    // 客户端：信号在组件内创建，初始值 0；通过状态恢复应为 42
    const holder: { current: Signal.State<number> | null } = { current: null }
    const dispose = hydrateWithState(
      () => {
        const client = createSignal(0)
        holder.current = client
        return jsx("div", { children: client })
      },
      container,
      [42],
    )
    expect(holder.current?.get()).toBe(42)
    expect(container.textContent).toBe("42")
    holder.current?.set(100)
    await flush()
    expect(container.textContent).toBe("100")
    dispose()
  })

  it("从 script 标签自动读取状态", async () => {
    const container = document.createElement("div")
    setSSRRuntime(ssrRuntime)
    const server = createSignal(7)
    container.innerHTML = await renderToFragment(() => jsx("div", { children: server }))
    setSSRRuntime(null)
    // 嵌入序列化状态脚本（在容器外，模拟真实场景）
    const script = document.createElement("script")
    script.id = "kiko-state"
    script.type = "application/json"
    script.textContent = "[7]"
    document.body.appendChild(script)

    const holder: { current: Signal.State<number> | null } = { current: null }
    const dispose = hydrateWithState(() => {
      const client = createSignal(0)
      holder.current = client
      return jsx("div", { children: client })
    }, container)
    expect(holder.current?.get()).toBe(7)
    expect(container.textContent).toBe("7")
    dispose()
    script.remove()
  })

  it("reports a mismatch when the server serialized more signals than the client creates", () => {
    const container = document.createElement("div")
    container.innerHTML = "<div></div>"
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    const dispose = hydrateWithState(() => jsx("div", { children: "static" }), container, [1, 2])
    console.error = orig
    expect(errors.some(e => e.includes("signal state mismatch"))).toBe(true)
    expect(errors.some(e => e.includes("server serialized 2 signals, client created 0"))).toBe(true)
    dispose()
  })

  it("reports a mismatch when the client creates more signals than the server serialized", () => {
    const container = document.createElement("div")
    container.innerHTML = "<div></div>"
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    const dispose = hydrateWithState(
      () => {
        createSignal(0)
        createSignal(0)
        return jsx("div", { children: "static" })
      },
      container,
      [1],
    )
    console.error = orig
    expect(errors.some(e => e.includes("server serialized 1 signals, client created 2"))).toBe(true)
    dispose()
  })
  it("stays silent when server and client signal counts match", async () => {
    const container = document.createElement("div")
    setSSRRuntime(ssrRuntime)
    const server = createSignal(9)
    container.innerHTML = await renderToFragment(() => jsx("div", { children: server }))
    setSSRRuntime(null)
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    const dispose = hydrateWithState(
      () => jsx("div", { children: createSignal(0) }),
      container,
      [9],
    )
    console.error = orig
    expect(container.textContent).toBe("9")
    expect(errors.some(e => e.includes("signal state mismatch"))).toBe(false)
    dispose()
  })
})
