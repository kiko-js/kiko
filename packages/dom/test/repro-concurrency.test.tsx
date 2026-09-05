/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, afterEach } from "bun:test"
import { createSignal } from "../src/signal"
import { startSignalCapture, stopSignalCapture, serializeSignals } from "../src/signal-serialize"
import { setSSRRuntime } from "../src/ssr-mode"
import { ssrRuntime } from "../src/ssr"
import { renderToStream } from "../src/ssr-stream"
import { withSSRScope } from "../src/ssr-scope"
import { jsx } from "../src/jsx-runtime"

afterEach(() => setSSRRuntime(null))

describe("SSR request scope isolation", () => {
  it("concurrent requests keep signal capture isolated", async () => {
    setSSRRuntime(ssrRuntime)
    // 请求 A:await 之后才创建信号树
    const aGate = Promise.withResolvers<void>()
    const renderA = withSSRScope(async () => {
      startSignalCapture()
      const App = async () => {
        await aGate.promise
        const s = createSignal("A-SECRET")
        void s
        return jsx("p", { children: "A" })
      }
      const { renderToFragment } = await import("../src/ssr")
      await renderToFragment(() => App())
      const aJson = serializeSignals()
      stopSignalCapture()
      return aJson
    })
    // 请求 B:同步渲染自己的信号,与 A 的 await 窗口重叠
    const renderB = withSSRScope(() => {
      startSignalCapture()
      const Bs = createSignal("B-SECRET")
      void Bs
      const { renderToFragment } = require("../src/ssr") as typeof import("../src/ssr")
      return renderToFragment(() => jsx("p", { children: "B" })).then(html => {
        const bJson = serializeSignals()
        stopSignalCapture()
        return { html, bJson }
      })
    })
    aGate.resolve()
    const [aJson, b] = await Promise.all([renderA, renderB])
    // 各请求载荷只含自己的信号
    expect(b.bJson).not.toContain("A-SECRET")
    expect(aJson).not.toContain("B-SECRET")
    expect(b.bJson).toContain("B-SECRET")
    expect(aJson).toContain("A-SECRET")
  })

  it("stream await window does not corrupt concurrent fragment render", async () => {
    setSSRRuntime(ssrRuntime)
    const gate = Promise.withResolvers<void>()
    const App = async () => {
      await gate.promise
      return jsx("p", { children: "stream" })
    }
    const stream = withSSRScope(() => renderToStream(() => App()))
    const chunks: string[] = []
    const reader = stream.getReader()
    const drain = (async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value!)
      }
    })()
    // 流的 await 窗口内,并发跑一个独立作用域的 fragment 渲染
    const fragPromise = withSSRScope(async () => {
      const { renderToFragment } = await import("../src/ssr")
      return renderToFragment(() => jsx("p", { children: "frag" }))
    })
    gate.resolve()
    const frag = await fragPromise
    await drain
    expect(frag).toContain("frag")
    expect(chunks.join("")).toContain("stream")
  })
})
