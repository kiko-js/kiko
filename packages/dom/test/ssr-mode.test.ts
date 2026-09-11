import { describe, it, expect, afterAll } from "bun:test"
import { getSSRRuntime, setSSRRuntime } from "../src/ssr-mode"
import { ssrRuntime } from "../src/ssr"
import type { SSRRuntime } from "../src/ssr-mode"

/**
 * SSR 运行时桥必须是「双包加载单例」：Bun 的 monorepo `paths` 别名会让
 * `@kikojs/dom` 的源码副本与 dist 副本同时进入同一进程/bundle（`@kikojs/router`
 * 的 dist 从消费方解析到源码别名时就是如此）。两份副本的 `getSSRRuntime()`
 * 必须读到同一槽位，否则 Router/Link 会误走客户端分支（`document is not
 * defined`）。查询串让 Bun 把同一文件当作独立 ESM 实例加载——正是第二份副本
 * 的等价物。
 */
async function secondCopy(): Promise<typeof import("../src/ssr-mode")> {
  // 非字面量 specifier：避免 tsc 静态解析带查询串的路径
  const spec = "../src/ssr-mode.ts?dual-package"
  return (await import(spec)) as typeof import("../src/ssr-mode")
}

afterAll(() => {
  setSSRRuntime(null)
})

describe("ssr-mode — 双包加载单例", () => {
  it("运行时注册跨副本可见", async () => {
    const copy = await secondCopy()
    expect(copy.getSSRRuntime).not.toBe(getSSRRuntime)

    setSSRRuntime(ssrRuntime)
    try {
      expect(copy.getSSRRuntime()).toBe(ssrRuntime)
      expect(getSSRRuntime()).toBe(ssrRuntime)
    } finally {
      setSSRRuntime(null)
    }
    expect(copy.getSSRRuntime()).toBeNull()
  })

  it("useSSRRuntime 的换入/恢复跨副本生效（流式 reenterRuntime）", async () => {
    const copy = await secondCopy()
    const streamRuntime: SSRRuntime = { ...ssrRuntime }

    setSSRRuntime(ssrRuntime)
    const restore = copy.useSSRRuntime(streamRuntime)
    try {
      expect(getSSRRuntime()).toBe(streamRuntime)
    } finally {
      restore()
    }
    expect(copy.getSSRRuntime()).toBe(ssrRuntime)
    setSSRRuntime(null)
  })
})
