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
  signalStateScript,
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
    expect(json).toBe('{"v":1,"s":[0,"kiko"]}')
  })

  it("捕获空渲染（无信号）", async () => {
    startSignalCapture()
    await renderToFragment(() => jsx("div", { children: "static" }))
    stopSignalCapture()
    expect(serializeSignals()).toBe('{"v":1,"s":[]}')
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
    expect(serializeSignals()).toBe('{"v":1,"s":[5]}')
  })

  it("对未停止的二次捕获发出并发误用警告", () => {
    startSignalCapture()
    const warns: string[] = []
    const orig = console.warn
    console.warn = (m: unknown) => warns.push(String(m))
    try {
      startSignalCapture()
    } finally {
      console.warn = orig
      stopSignalCapture()
    }
    expect(warns.length).toBe(1)
    expect(warns[0]).toContain("withSSRScope")
    expect(isCapturing()).toBe(false)
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

describe("信号序列化 — envelope 与安全", () => {
  it("输出 `<` 转义，信号值含 </script> 时嵌入脚本不破防", () => {
    startSignalCapture()
    createSignal("</script><img src=x onerror=alert(1)>")
    const json = serializeSignals()
    stopSignalCapture()
    expect(json).not.toContain("</")
    expect(json).toContain("\\u003c")
    // 语义等价：解析后取回原值
    restoreSignals(json)
    expect(createSignal("").get()).toBe("</script><img src=x onerror=alert(1)>")
    stopSignalRestore()
  })

  it("signalStateScript 输出完整脚本块", () => {
    startSignalCapture()
    createSignal(42)
    const script = signalStateScript()
    stopSignalCapture()
    expect(script).toBe('<script id="kiko-state" type="application/json">{"v":1,"s":[42]}</script>')
  })

  it("循环引用 throw 且带信号序号", () => {
    startSignalCapture()
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    createSignal(cyc)
    expect(() => serializeSignals()).toThrow(/signal #0.*cyclic/)
    stopSignalCapture()
  })

  it("bigint / 函数 throw 且带值描述", () => {
    startSignalCapture()
    createSignal(1n)
    expect(() => serializeSignals()).toThrow(/signal #0.*bigint/)
    stopSignalCapture()
    startSignalCapture()
    createSignal(() => 1)
    expect(() => serializeSignals()).toThrow(/signal #0.*Function/)
    stopSignalCapture()
  })

  it("嵌套在对象里的不可序列化值同样 throw", () => {
    startSignalCapture()
    const outer: Record<string, unknown> = { deep: { fn: () => 1 } }
    createSignal(outer)
    expect(() => serializeSignals()).toThrow(/signal #0.*\.deep\.fn/)
    stopSignalCapture()
  })

  it("有损类型聚合 warn（undefined / NaN / Date / Map）", () => {
    startSignalCapture()
    createSignal(undefined)
    createSignal(NaN)
    createSignal(new Date(0))
    createSignal(new Map([[1, 2]]))
    const warns: string[] = []
    const orig = console.warn
    console.warn = (m: unknown) => warns.push(String(m))
    try {
      serializeSignals()
    } finally {
      console.warn = orig
      stopSignalCapture()
    }
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain("lossy")
    expect(warns[0]).toContain("#0 undefined→null")
    expect(warns[0]).toContain("#1 NaN→null")
    expect(warns[0]).toContain("#2 Date→string")
    expect(warns[0]).toContain("#3 Map→{}")
  })
})

describe("信号序列化 — envelope 解析", () => {
  it("接受 envelope JSON 字符串与对象", () => {
    restoreSignals('{"v":1,"s":[9,"x"]}')
    expect(createSignal(0).get()).toBe(9)
    expect(createSignal("").get()).toBe("x")
    stopSignalRestore()
    restoreSignals({ v: 1, s: [7] })
    expect(createSignal(0).get()).toBe(7)
    stopSignalRestore()
  })

  it("拒绝未知格式版本与未知载荷", () => {
    expect(() => restoreSignals('{"v":2,"s":[1]}')).toThrow(/version 2/)
    expect(() => restoreSignals('{"nope":true}')).toThrow(/unrecognized/)
    expect(() => restoreSignals("{oops")).toThrow(/not valid JSON/)
  })

  it("旧格式裸值数组仍可恢复（持久化兼容）", () => {
    restoreSignals("[3,4]")
    expect(createSignal(0).get()).toBe(3)
    expect(createSignal(0).get()).toBe(4)
    stopSignalRestore()
  })
})

describe("信号序列化 — 类型指纹诊断", () => {
  it("数量一致但顺序漂移时按类型指纹报错", () => {
    // 服务端序：number, string；客户端创建序漂移：string, number
    restoreSignals([1, "x"])
    createSignal("a") // 消费 #0: number vs string → 错位
    createSignal(2) // 消费 #1: string vs number → 错位
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    try {
      stopSignalRestore()
    } finally {
      console.error = orig
    }
    const msg = errors.join("\n")
    expect(msg).toContain("type mismatch")
    expect(msg).toContain("#0: serialized number, client initial string")
  })

  it("顺序一致时不报", () => {
    restoreSignals([1, "x"])
    createSignal(0)
    createSignal("")
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    try {
      stopSignalRestore()
    } finally {
      console.error = orig
    }
    expect(errors.join("\n")).not.toContain("type mismatch")
  })
})
