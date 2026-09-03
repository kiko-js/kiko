/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { renderToFragment } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import { ssrRuntime } from "../src/ssr"
import {
  startSignalCapture,
  stopSignalCapture,
  serializeSignals,
  restoreSignals,
  stopSignalRestore,
  isCapturing,
  isRestoring,
} from "../src/signal-serialize"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
  setSSRRuntime(ssrRuntime)
})

describe("信号序列化 — 捕获与序列化", () => {
  it("捕获渲染期创建的信号", async () => {
    startSignalCapture()
    expect(isCapturing()).toBe(true)
    const html = await renderToFragment(() => {
      const count = createSignal(0)
      const name = createSignal("kiko")
      return jsx("div", { children: [count, jsx("span", { children: name })] })
    })
    stopSignalCapture()
    expect(isCapturing()).toBe(false)
    expect(html).toBe("<div><!---->0<span><!---->kiko</span></div>")
    const json = serializeSignals()
    expect(json).toBe('[0,"kiko"]')
  })

  it("捕获空渲染（无信号）", async () => {
    startSignalCapture()
    await renderToFragment(() => jsx("div", { children: "static" }))
    stopSignalCapture()
    expect(serializeSignals()).toBe("[]")
  })

  it("捕获后信号值变化反映在序列化中", async () => {
    startSignalCapture()
    await renderToFragment(() => {
      const count = createSignal(0)
      count.set(5) // 渲染后修改
      return jsx("div", { children: count })
    })
    stopSignalCapture()
    // 序列化取当前值（渲染后的快照）
    expect(serializeSignals()).toBe("[5]")
  })
})

describe("信号序列化 — 恢复", () => {
  it("恢复模式替换 createSignal 初始值", () => {
    restoreSignals([42, "restored"])
    expect(isRestoring()).toBe(true)
    const a = createSignal(0)
    const b = createSignal("default")
    const c = createSignal("extra") // 超出序列化长度，用原初始值
    stopSignalRestore()
    expect(a.get()).toBe(42)
    expect(b.get()).toBe("restored")
    expect(c.get()).toBe("extra")
    expect(isRestoring()).toBe(false)
  })

  it("从 JSON 字符串恢复", () => {
    restoreSignals('[10, "hello"]')
    const a = createSignal(0)
    const b = createSignal("default")
    stopSignalRestore()
    expect(a.get()).toBe(10)
    expect(b.get()).toBe("hello")
  })

  it("恢复后停止，后续 createSignal 用原初始值", () => {
    restoreSignals([99])
    const a = createSignal(0)
    stopSignalRestore()
    const b = createSignal(1)
    expect(a.get()).toBe(99)
    expect(b.get()).toBe(1)
  })
})

describe("信号序列化 — 端到端", () => {
  it("服务端捕获的状态可在客户端恢复", async () => {
    // 服务端：捕获
    startSignalCapture()
    const html = await renderToFragment(() => {
      const count = createSignal(7)
      const label = createSignal("kiko")
      return jsx("div", { children: [count, jsx("span", { children: label })] })
    })
    stopSignalCapture()
    const json = serializeSignals()
    expect(html).toBe("<div><!---->7<span><!---->kiko</span></div>")

    // 客户端：恢复（初始值不同，应被覆盖）
    restoreSignals(json)
    const clientCount = createSignal(0)
    const clientLabel = createSignal("default")
    stopSignalRestore()
    expect(clientCount.get()).toBe(7)
    expect(clientLabel.get()).toBe("kiko")
  })
})
