/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { jsx, Style } from "../src/jsx-runtime"
import { Show, For, Suspend } from "../src/flow"
import { renderToStream } from "../src/ssr-stream"
import { renderToFragment } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import { ssrRuntime } from "../src/ssr"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
  setSSRRuntime(ssrRuntime)
})

afterAll(() => {
  setSSRRuntime(null)
})
/** 收集 ReadableStream 的所有块 */
async function streamToChunks(stream: ReadableStream<string>): Promise<string[]> {
  const chunks: string[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

/** 等待指定毫秒（测试用） */
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe("renderToStream — 同步内容", () => {
  it("流式输出与 renderToFragment 一致（基础元素）", async () => {
    const stream = renderToStream(() =>
      jsx("div", {
        className: "app",
        children: [jsx("h1", { children: "Hello" }), jsx("p", { children: "world" })],
      }),
    )
    const chunks = await streamToChunks(stream)
    const html = chunks.join("")
    const expected = await renderToFragment(() =>
      jsx("div", {
        className: "app",
        children: [jsx("h1", { children: "Hello" }), jsx("p", { children: "world" })],
      }),
    )
    expect(html).toBe(expected)
  })

  it("转义文本与属性", async () => {
    const stream = renderToStream(() => jsx("div", { title: 'a"b', children: "1 < 2 & 3 > 1" }))
    const html = (await streamToChunks(stream)).join("")
    expect(html).toBe('<div title="a&quot;b">1 &lt; 2 &amp; 3 &gt; 1</div>')
  })

  it("渲染信号子节点（带水合标记）", async () => {
    const count = createSignal(42)
    const stream = renderToStream(() => jsx("span", { children: count }))
    const html = (await streamToChunks(stream)).join("")
    expect(html).toBe("<span><!---->42</span>")
  })

  it("渲染 Show / For 控制流", async () => {
    const items = createSignal([1, 2, 3])
    const stream = renderToStream(() =>
      jsx("div", {
        children: [
          jsx(Show, { when: true, children: jsx("p", { children: "visible" }) }),
          jsx("ul", {
            children: jsx(For, {
              each: items,
              children: (item: number) => jsx("li", { children: String(item) }),
            }),
          }),
        ],
      }),
    )
    const html = (await streamToChunks(stream)).join("")
    expect(html).toBe(
      "<div><!--show--><p>visible</p><ul><!--for--><li>1</li><li>2</li><li>3</li></ul></div>",
    )
  })

  it("passes nonce to <style> in streaming SSR", async () => {
    const stream = renderToStream(() =>
      Style({ global: true, nonce: "stream-nonce", children: ".a { color: red }" }),
    )
    const html = (await streamToChunks(stream)).join("")
    expect(html).toBe(`<style nonce="stream-nonce">.a { color: red }</style>`)
  })

  it("omits scoped <Style> in streaming (no global leak) and warns", async () => {
    const warns: string[] = []
    const orig = console.warn
    console.warn = (m: unknown) => warns.push(String(m))
    let html = ""
    try {
      const stream = renderToStream(() =>
        jsx("div", {
          children: [
            Style({ children: ".card { color: red }" }),
            jsx("div", { class: "card", children: "x" }),
          ],
        }),
      )
      html = (await streamToChunks(stream)).join("")
    } finally {
      console.warn = orig
    }
    // 修复前：scoped css 静默降级为全局 → <style>.card…</style> 泄漏整页
    expect(html).toContain("<style></style>")
    expect(html).not.toContain(".card { color: red }")
    expect(html).not.toMatch(/data-kiko-v\d/)
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain("omitted (no effect)")
  })
})

describe("renderToStream — 异步 Suspend", () => {
  it("输出同步骨架 + suspend 标记 + 异步内容", async () => {
    const asyncContent = wait(20).then(() => jsx("p", { children: "loaded" }))
    const stream = renderToStream(() =>
      jsx("div", {
        children: [
          jsx("h1", { children: "Sync Header" }),
          jsx(Suspend, {
            fallback: jsx("p", { children: "loading" }),
            children: asyncContent,
          }),
        ],
      }),
    )

    const chunks = await streamToChunks(stream)
    const html = chunks.join("")
    // 最终输出包含同步头部 + suspend 标记 + 异步内容
    expect(html).toBe("<div><h1>Sync Header</h1><!--suspend--><p>loaded</p><!--/suspend--></div>")
  })
  it("同步内容在异步 resolve 前已 flush（TTFB 优势）", async () => {
    const asyncContent = wait(30).then(() => jsx("p", { children: "loaded" }))
    const stream = renderToStream(() =>
      jsx("div", {
        children: [
          jsx("h1", { children: "Sync" }),
          jsx(Suspend, {
            fallback: jsx("p", { children: "loading" }),
            children: asyncContent,
          }),
        ],
      }),
    )

    const reader = stream.getReader()
    // 同步内容应在异步 resolve 前已到达（wait(30) 期间）
    const syncParts: string[] = []
    const deadline = Date.now() + 10
    while (Date.now() < deadline) {
      const { done, value } = await reader.read()
      if (done) break
      syncParts.push(value)
      // 一旦收到 suspend 标记，说明同步骨架已完整输出
      if (syncParts.join("").includes("<!--suspend-->")) break
    }
    expect(syncParts.join("")).toBe("<div><h1>Sync</h1><!--suspend-->")

    // 等待剩余内容（异步 resolve 后）
    const rest: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      rest.push(value)
    }
    expect(rest.join("")).toBe("<p>loaded</p><!--/suspend--></div>")
  })
})

describe("renderToStream — 异步 Suspend reject", () => {
  it("reject 时上报错误并渲染 fallback，流正常完成（不整流出错）", async () => {
    const reported: unknown[] = []
    const original = globalThis.reportError
    // @ts-ignore
    globalThis.reportError = (e: unknown) => reported.push(e)
    try {
      const stream = renderToStream(() =>
        jsx(Suspend, {
          fallback: jsx("p", { children: "load failed" }),
          children: Promise.reject(new Error("boom")),
        }),
      )
      expect((await streamToChunks(stream)).join("")).toBe(
        "<!--suspend--><p>load failed</p><!--/suspend-->",
      )
      expect(reported).toHaveLength(1)
    } finally {
      // @ts-ignore
      globalThis.reportError = original
    }
  })

  it("数组 children 任一 reject 同样渲染 fallback", async () => {
    const original = globalThis.reportError
    // @ts-ignore
    globalThis.reportError = () => {}
    try {
      const stream = renderToStream(() =>
        jsx(Suspend, {
          fallback: "load failed",
          children: [Promise.resolve("fine"), Promise.reject(new Error("boom"))],
        }),
      )
      expect((await streamToChunks(stream)).join("")).toBe(
        "<!--suspend-->load failed<!--/suspend-->",
      )
    } finally {
      // @ts-ignore
      globalThis.reportError = original
    }
  })
})

describe("renderToStream — abort", () => {
  it("abort 后流以 reason 报错，未决内容不再输出", async () => {
    const ac = new AbortController()
    const late = wait(300).then(() => jsx("p", { children: "late" }))
    const stream = renderToStream(
      () =>
        jsx("div", {
          children: jsx(Suspend, {
            fallback: jsx("p", { children: "..." }),
            children: late,
          }),
        }),
      { signal: ac.signal },
    )
    const chunks: string[] = []
    const drained = (async () => {
      const reader = stream.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    })()
    await wait(20) // 骨架已 flush，Suspend 仍在等待
    ac.abort(new Error("client gone"))
    await expect(drained).rejects.toThrow("client gone")
    const html = chunks.join("")
    expect(html).toContain("<!--suspend-->")
    expect(html).not.toContain("late")
  })

  it("signal 已 abort 时立即报错，不执行渲染", async () => {
    const ac = new AbortController()
    ac.abort(new Error("pre-aborted"))
    const stream = renderToStream(() => jsx("p", { children: "never" }), { signal: ac.signal })
    const reader = stream.getReader()
    await expect(reader.read()).rejects.toThrow("pre-aborted")
  })

  it("未 abort 时带 signal 也正常完成", async () => {
    const ac = new AbortController()
    const stream = renderToStream(() => jsx("p", { children: "ok" }), { signal: ac.signal })
    expect((await streamToChunks(stream)).join("")).toBe("<p>ok</p>")
  })

  it("abort 后运行时槽已恢复，同进程可继续串行渲染", async () => {
    const ac = new AbortController()
    const stream = renderToStream(
      () =>
        jsx("div", {
          children: jsx(Suspend, {
            fallback: jsx("p", { children: "..." }),
            children: wait(300).then(() => jsx("p", { children: "late" })),
          }),
        }),
      { signal: ac.signal },
    )
    const reader = stream.getReader()
    await reader.read() // 骨架已 flush
    ac.abort(new Error("client gone"))
    await reader.read().catch(() => {}) // 确认流已报错
    // abort 前流式运行时占据槽位；恢复必须先于消费方通知，串行渲染才不被污染
    expect(await renderToFragment(() => jsx("p", { children: "next" }))).toBe("<p>next</p>")
  })
})
