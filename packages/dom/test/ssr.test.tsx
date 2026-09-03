/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { jsx, Fragment, Style } from "../src/jsx-runtime"
import { Show, For, ErrorBoundary, Suspend } from "../src/flow"
import { lazy } from "../src/lazy"
import { renderToFragment, ssrRuntime } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import { createSignal } from "../src/signal"
import type { AsyncComponent } from "../src/jsx-runtime"

beforeAll(async () => {
  await import("./setup")
  // 显式注册 SSR 运行时（server.ts 入口的等价行为）；测试后重置——
  // bun test 同进程共享模块状态，残留注册会毒化其他测试文件
  setSSRRuntime(ssrRuntime)
})

afterAll(() => {
  setSSRRuntime(null)
})

// SSR 渲染路径本身不触碰 document。

describe("renderToFragment — 元素与属性", () => {
  it("renders a basic element tree", async () => {
    expect(await renderToFragment(() => jsx("div", { class: "a", children: "hi" }))).toBe(
      `<div class="a">hi</div>`,
    )
  })

  it("escapes text and attribute values", async () => {
    expect(
      await renderToFragment(() => jsx("p", { title: `a"b<c>`, children: `1 < 2 & 3 > 0` })),
    ).toBe(`<p title="a&quot;b&lt;c&gt;">1 &lt; 2 &amp; 3 &gt; 0</p>`)
  })

  it("serializes boolean attrs bare and skips falsy ones", async () => {
    expect(
      await renderToFragment(() =>
        jsx("input", { disabled: true, checked: false, placeholder: "x" }),
      ),
    ).toBe(`<input disabled placeholder="x">`)
  })

  it("renders void elements without a closing tag", async () => {
    expect(await renderToFragment(() => jsx("img", { src: "a.png", alt: "a" }))).toBe(
      `<img src="a.png" alt="a">`,
    )
  })

  it("serializes style objects as kebab-case css", async () => {
    expect(
      await renderToFragment(() =>
        jsx("div", { style: { color: "red", backgroundColor: "blue" } }),
      ),
    ).toBe(`<div style="color: red; background-color: blue"></div>`)
  })

  it("drops event handlers", async () => {
    const html = await renderToFragment(() => jsx("button", { onClick: () => {}, children: "go" }))
    expect(html).toBe(`<button>go</button>`)
  })

  it("snapshots signal children (with hydration marker) and signal props", async () => {
    const count = createSignal(2)
    const hidden = createSignal(false)
    const html = await renderToFragment(() => jsx("p", { hidden, children: count }))
    expect(html).toBe(`<p><!---->2</p>`)
  })

  it("renders Fragment children", async () => {
    expect(await renderToFragment(() => Fragment({ children: [jsx("a", {}), jsx("b", {})] }))).toBe(
      `<a></a><b></b>`,
    )
  })

  it("serializes numeric children and skips nullish/false", async () => {
    expect(await renderToFragment(() => jsx("span", { children: 42 }))).toBe(`<span>42</span>`)
    expect(await renderToFragment(() => jsx("span", { children: 0 }))).toBe(`<span>0</span>`)
    expect(await renderToFragment(() => jsx("span", { children: null }))).toBe(`<span></span>`)
    expect(await renderToFragment(() => jsx("span", { children: false }))).toBe(`<span></span>`)
  })

  it("escapes single quotes in attributes", async () => {
    expect(await renderToFragment(() => jsx("p", { title: "it's" }))).toBe(
      `<p title="it&#39;s"></p>`,
    )
  })
})

describe("renderToFragment — 控制流", () => {
  it("Show renders truthy branch and fallback", async () => {
    const on = createSignal(true)
    expect(
      await renderToFragment(() =>
        Show({
          when: on,
          fallback: "off",
          children: "on",
        }),
      ),
    ).toBe(`<!--show-->on`)
    expect(
      await renderToFragment(() => Show({ when: false, fallback: "off", children: "on" })),
    ).toBe(`<!--show-->off`)
  })

  it("Show calls function children with the truthy value", async () => {
    const html = await renderToFragment(() =>
      Show({
        when: createSignal(5),
        children: (n: number) => jsx("b", { children: String(n) }),
      }),
    )
    expect(html).toBe(`<!--show--><b>5</b>`)
  })

  it("For renders each item", async () => {
    const html = await renderToFragment(() =>
      For({
        each: ["a", "b", "c"],
        children: item => jsx("li", { children: item }),
      }),
    )
    expect(html).toBe(`<!--for--><li>a</li><li>b</li><li>c</li>`)
  })

  it("For keyed mode passes accessors like the client", async () => {
    const html = await renderToFragment(() =>
      For({
        each: ["a", "b"],
        getKey: item => item,
        children: item => jsx("li", { children: item() }),
      }),
    )
    expect(html).toBe(`<!--for--><li>a</li><li>b</li>`)
  })

  it("ErrorBoundary swaps to fallback on throw", async () => {
    const Boom = (): Node => {
      throw new Error("boom")
    }
    expect(
      await renderToFragment(() =>
        ErrorBoundary({
          fallback: "fallback",
          children: () => jsx(Boom, {}),
        }),
      ),
    ).toBe(`<!--error-boundary-->fallback`)
  })
})

describe("renderToFragment — 异步", () => {
  it("Suspend awaits promise children and renders resolved html", async () => {
    const { promise, resolve } = Promise.withResolvers<Node>()
    const htmlPromise = renderToFragment(() => Suspend({ fallback: "loading", children: promise }))
    resolve(jsx("span", { children: "loaded" }))
    expect(await htmlPromise).toBe(`<!--suspend--><span>loaded</span><!--/suspend-->`)
  })

  it("Suspend renders fallback when a promise rejects", async () => {
    const reported: unknown[] = []
    const original = globalThis.reportError
    // @ts-ignore
    globalThis.reportError = (e: unknown) => {
      reported.push(e)
    }
    try {
      const { promise, reject } = Promise.withResolvers<Node>()
      const htmlPromise = renderToFragment(() =>
        Suspend({ fallback: "fallback", children: promise }),
      )
      reject(new Error("nope"))
      expect(await htmlPromise).toBe(`<!--suspend-->fallback<!--/suspend-->`)
      expect(reported.length).toBe(1)
    } finally {
      // @ts-ignore
      globalThis.reportError = original
    }
  })

  it("Suspend renders fallback when any promise in an array rejects", async () => {
    const reported: unknown[] = []
    const original = globalThis.reportError
    // @ts-ignore
    globalThis.reportError = (e: unknown) => {
      reported.push(e)
    }
    try {
      const { promise: a, resolve: ra } = Promise.withResolvers<Node>()
      const { promise: b, reject: rb } = Promise.withResolvers<Node>()
      const htmlPromise = renderToFragment(() =>
        Suspend({ fallback: "fallback", children: [a, b] }),
      )
      ra(jsx("span", { children: "A" }))
      rb(new Error("b failed"))
      expect(await htmlPromise).toBe(`<!--suspend-->fallback<!--/suspend-->`)
      expect(reported.length).toBe(1)
      expect((reported[0] as Error).message).toBe("b failed")
    } finally {
      // @ts-ignore
      globalThis.reportError = original
    }
  })

  it("renders async components and lazy modules", async () => {
    const AsyncCard: AsyncComponent = async () => jsx("span", { children: "async" })
    const LazyCard = lazy(() => Promise.resolve(() => jsx("span", { children: "lazy" })))
    const html = await renderToFragment(() =>
      Suspend({
        fallback: "loading",
        children: [jsx(AsyncCard, {}), jsx(LazyCard, {})],
      }),
    )
    expect(html).toBe(`<!--suspend--><span>async</span><span>lazy</span><!--/suspend-->`)
  })

  it("resolves promises nested inside arrays and elements", async () => {
    const { promise, resolve } = Promise.withResolvers<string>()
    const htmlPromise = renderToFragment(() =>
      jsx("div", { children: [jsx("b", { children: "x" }), promise] }),
    )
    resolve("y")
    expect(await htmlPromise).toBe(`<div><b>x</b>y</div>`)
  })
})

describe("Style 的 SSR", () => {
  it("scoped style attaches the scope attr to the nearest ancestor", async () => {
    const html = await renderToFragment(() =>
      jsx("main", {
        children: [
          jsx("span", { children: "" }),
          jsx("div", { children: [Style({ children: ".card { color: red }" })] }),
        ],
      }),
    )
    expect(html).toMatch(/<div data-kiko-v\d+>/)
    expect(html).toMatch(/<style>\[data-kiko-v\d+\] \.card/)
    expect(html).not.toMatch(/<span data-kiko-v/)
  })

  it("global style renders the css verbatim", async () => {
    const html = await renderToFragment(() =>
      Style({ global: true, children: ".a > .b { color: red }" }),
    )
    expect(html).toBe(`<style>.a > .b { color: red }</style>`)
  })

  it("scope attr lands on the ancestor even when style has later siblings", async () => {
    // 回归：序列化顺序下兄弟元素先于父序列化，scope 曾错误落在兄弟上
    // （<p data-kiko-v1>），导致 scoped css 失效且与客户端（挂父）不一致。
    const html = await renderToFragment(() =>
      jsx("main", {
        children: [
          Style({ children: ".card { color: red }" }),
          jsx("p", { class: "card", children: "x" }),
        ],
      }),
    )
    expect(html).toMatch(/<main data-kiko-v\d+><style>/)
    expect(html).not.toMatch(/<p class="card" data-kiko-v/)
    expect(html).not.toContain("kiko-scope")
  })

  it("scope attr nests to the innermost containing element", async () => {
    const html = await renderToFragment(() =>
      jsx("main", {
        children: jsx("div", {
          children: [Style({ children: ".a { color: red }" })],
        }),
      }),
    )
    expect(html).toMatch(/<main><div data-kiko-v\d+><style>/)
  })

  it("passes nonce to global style", async () => {
    const html = await renderToFragment(() =>
      Style({ global: true, nonce: "abc123", children: ".a { color: red }" }),
    )
    expect(html).toBe(`<style nonce="abc123">.a { color: red }</style>`)
  })

  it("passes nonce to scoped style", async () => {
    const html = await renderToFragment(() =>
      jsx("div", {
        children: [Style({ nonce: "xyz789", children: ".card { color: red }" })],
      }),
    )
    expect(html).toMatch(/<div data-kiko-v\d+>/)
    expect(html).toMatch(/<style nonce="xyz789">\[data-kiko-v\d+\] \.card/)
  })

  it("escapes nonce attribute value", async () => {
    const html = await renderToFragment(() =>
      Style({ global: true, nonce: 'a"b', children: ".a { color: red }" }),
    )
    expect(html).toBe(`<style nonce="a&quot;b">.a { color: red }</style>`)
  })

  it("scoped style at fragment root warns", async () => {
    const warnings: string[] = []
    const orig = console.warn
    console.warn = (m: unknown) => warnings.push(String(m))
    try {
      const html = await renderToFragment(() => Style({ children: ".card { color: red }" }))
      // scope 标记被 extractScopeMarkers 清理，但 CSS 仍是 scoped 选择器
      expect(html).not.toContain("kiko-scope")
      expect(html).toMatch(/<style>\[data-kiko-v\d+\] \.card/)
      // 应输出警告
      expect(warnings.some(w => w.includes("fragment root"))).toBe(true)
    } finally {
      console.warn = orig
    }
  })
})

describe("并发安全", () => {
  it("two concurrent renders do not cross-talk", async () => {
    const a = renderToFragment(() => jsx("div", { children: "A" }))
    const b = renderToFragment(() => jsx("span", { children: "B" }))
    const [ha, hb] = await Promise.all([a, b])
    expect(ha).toBe(`<div>A</div>`)
    expect(hb).toBe(`<span>B</span>`)
  })
})

describe("RAW TEXT 元素的 SSR", () => {
  it("renders script content verbatim (no HTML escaping)", async () => {
    const html = await renderToFragment(() =>
      jsx("script", { children: 'const x = 1 < 2; window.data = "<b>hi</b>";' }),
    )
    expect(html).toBe('<script>const x = 1 < 2; window.data = "<b>hi</b>";</script>')
  })

  it("guards closing-tag injection inside raw text", async () => {
    const html = await renderToFragment(() =>
      jsx("script", { children: "if (a) {</script><img src=x onerror=alert(1)>}" }),
    )
    // "</script" 被转义为 "<\/script"，注入的标签留在文本里，不会提前闭合
    expect(html).toBe("<script>if (a) {<\\/script><img src=x onerror=alert(1)>}</script>")
    expect(html).not.toMatch(/<\/script><img/)
  })

  it("flattens signals and arrays inside raw text", async () => {
    const label = createSignal("L")
    const html = await renderToFragment(() =>
      jsx("script", { type: "application/json", children: ['{"name":', label, "}"] }),
    )
    expect(html).toBe('<script type="application/json">{"name":L}</script>')
  })

  it("renders noscript/iframe raw content", async () => {
    const html = await renderToFragment(() =>
      jsx("noscript", { children: jsx("iframe", { src: "x", children: "plain" }) }),
    )
    expect(html).toBe('<noscript><iframe src="x">plain</iframe></noscript>')
  })
})
