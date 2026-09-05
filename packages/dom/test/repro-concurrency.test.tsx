/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, afterEach } from "bun:test"
import { createSignal } from "../src/signal"
import { startSignalCapture, stopSignalCapture, serializeSignals } from "../src/signal-serialize"
import { setSSRRuntime } from "../src/ssr-mode"
import { ssrRuntime } from "../src/ssr"
import { renderToStream } from "../src/ssr-stream"
import { jsx } from "../src/jsx-runtime"

afterEach(() => setSSRRuntime(null))

// 已实证的两个 SSR 并发隔离缺陷(修复方案待定):以 rejects 断言固化
// 可执行复现——修复后应翻转为 resolves 且断言不再抛错。

async function signalCaptureInterleaves(): Promise<void> {
  setSSRRuntime(ssrRuntime)
  // 请求 A:渲染一个 await 后才创建信号树
  const aGate = Promise.withResolvers<void>()
  const renderA = (async () => {
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
  })()
  // 请求 B:同步渲染自己的信号
  startSignalCapture()
  const Bs = createSignal("B-SECRET")
  void Bs
  const { renderToFragment } = await import("../src/ssr")
  await renderToFragment(() => jsx("p", { children: "B" }))
  const bSerialized = serializeSignals()
  stopSignalCapture()
  aGate.resolve()
  const aJson = await renderA
  // B 的载荷不应包含 A 的信号;A 的载荷不应包含 B 的信号
  expect(bSerialized).not.toContain("A-SECRET")
  expect(aJson).not.toContain("B-SECRET")
}

async function streamWindowCorruptsFragment(): Promise<void> {
  setSSRRuntime(ssrRuntime)
  const gate = Promise.withResolvers<void>()
  const App = async () => {
    await gate.promise
    return jsx("p", { children: "stream" })
  }
  const stream = renderToStream(() => App())
  const chunks: string[] = []
  const reader = stream.getReader()
  const drain = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value!)
    }
  })()
  // 流在 await 窗口内,并发跑一个 fragment 渲染
  const { renderToFragment } = await import("../src/ssr")
  const fragPromise = renderToFragment(() => jsx("p", { children: "frag" }))
  gate.resolve()
  const frag = await fragPromise
  await drain
  expect(frag).toContain("frag")
  expect(chunks.join("")).toContain("stream")
}

describe("known bug: concurrent SSR isolation", () => {
  it("signal capture state is not request-isolated (cross-request data leak)", async () => {
    await expect(signalCaptureInterleaves()).rejects.toThrow()
  })

  it("renderToStream swaps the global SSR runtime (corrupts concurrent renders)", async () => {
    await expect(streamWindowCorruptsFragment()).rejects.toThrow()
  })
})
