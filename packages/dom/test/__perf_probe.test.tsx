/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it } from "bun:test"
import { render } from "../src/render"
import { Show } from "../src/flow"
import { jsx } from "../src/jsx-runtime"
import { createSignal } from "../src/signal"
import { lazyMode } from "../src/lazy-node"
import type { Component } from "../src/jsx-runtime"

function ms(): number {
  return performance.now()
}

function heapUsed(): number {
  Bun.gc(true)
  return process.memoryUsage().heapUsed
}

// 组件树:每个组件 = 1 个 div + 1 个 span(children 含组件)+ 1 段文本
const Leaf: Component = () => jsx("span", { children: "leaf" })
const Item: Component = () =>
  jsx("div", { children: [jsx("p", { children: "static" }), jsx(Leaf, null)] })

function buildTree(n: number): Node {
  const items: unknown[] = []
  for (let i = 0; i < n; i++) items.push(jsx(Item, null))
  return jsx("div", { children: items })
}

function renderTree(n: number): number {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const t0 = ms()
  const dispose = render(buildTree(n), container)
  const t1 = ms()
  dispose()
  container.remove()
  return t1 - t0
}

describe("lazy perf (experiment)", () => {
  it("benchmarks build+render, eager vs lazy", () => {
    const N = 5000
    // 预热 JIT
    renderTree(200)
    renderTree(200)
    for (const mode of [true, false, true, false] as const) {
      lazyMode.enabled = mode
      // 每轮跑 3 次取中位,降低噪声
      const runs: number[] = []
      for (let i = 0; i < 3; i++) runs.push(renderTree(N))
      runs.sort((a, b) => a - b)
      console.log(
        `mode=${mode ? "lazy  " : "eager "} build+render ${N} comps: median ${runs[1]!.toFixed(2)}ms (${runs.map(r => r.toFixed(1)).join(", ")})`,
      )
    }
    lazyMode.enabled = true
  })

  it("benchmarks construction-only cost (no render)", () => {
    const N = 20000
    for (const mode of [false, true] as const) {
      lazyMode.enabled = mode
      Bun.gc(true)
      const h0 = heapUsed()
      const t0 = ms()
      for (let i = 0; i < 5; i++) {
        const tree = buildTree(N)
        Bun.gc(true)
        void tree
      }
      const t1 = ms()
      const h1 = heapUsed()
      console.log(
        `mode=${mode ? "lazy  " : "eager "} construct 5x${N} comps: ${(t1 - t0).toFixed(1)}ms, heap delta ${(h1 - h0) / 1024}KB`,
      )
    }
    lazyMode.enabled = true
  })

  it("benchmarks signal-driven update hot path", async () => {
    const flush = (): Promise<void> => new Promise(r => queueMicrotask(r))
    for (const mode of [true, false] as const) {
      lazyMode.enabled = mode
      const count = createSignal(false)
      const container = document.createElement("div")
      document.body.appendChild(container)
      const dispose = render(
        jsx("div", {
          children: jsx(Show, {
            when: count,
            fallback: jsx("span", { children: "off" }),
            children: jsx("b", { children: "on" }),
          }),
        }),
        container,
      )
      const t0 = ms()
      for (let i = 0; i < 200; i++) {
        count.set(i % 2 === 0)
        await flush()
      }
      const t1 = ms()
      console.log(`mode=${mode ? "lazy  " : "eager "} 200 Show toggles: ${(t1 - t0).toFixed(2)}ms`)
      dispose()
      container.remove()
    }
    lazyMode.enabled = true
  })

  it("benchmarks text-signal updates on large static tree", async () => {
    const flush = (): Promise<void> => new Promise(r => queueMicrotask(r))
    for (const mode of [true, false] as const) {
      lazyMode.enabled = mode
      const text = createSignal("x")
      const container = document.createElement("div")
      document.body.appendChild(container)
      const items: unknown[] = []
      for (let i = 0; i < 200; i++) items.push(jsx("span", { children: text }))
      const dispose = render(jsx("div", { children: items }), container)
      const t0 = ms()
      for (let i = 0; i < 100; i++) {
        text.set(`v${i}`)
        await flush()
      }
      const t1 = ms()
      console.log(
        `mode=${mode ? "lazy  " : "eager "} 200 text-signal updates x200 bindings: ${(t1 - t0).toFixed(2)}ms`,
      )
      dispose()
      container.remove()
    }
    lazyMode.enabled = true
  })
})
