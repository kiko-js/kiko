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
  setSignalStateCodec,
  isCapturing,
  isRestoring,
} from "../src/signal-serialize"
import { createSignal } from "../src/signal"
beforeAll(async () => {
  await import("./setup")
  setSSRRuntime(ssrRuntime)
})

/**
 * 调试开关由服务端 `NODE_ENV` 驱动（isDevMode）。测试需在"开发模式"下验证
 * 无损 gate / `l` 标记产出，因此临时把 NODE_ENV 置为 development，结束还原。
 */
function withDevMode(run: () => void): void {
  const prev = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = "development"
    run()
  } finally {
    process.env.NODE_ENV = prev
  }
}

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

  it("循环引用 throw 且带信号序号（开发模式）", () => {
    withDevMode(() => {
      startSignalCapture()
      const cyc: Record<string, unknown> = {}
      cyc.self = cyc
      createSignal(cyc)
      expect(() => serializeSignals()).toThrow(/signal #0.*cyclic/)
      stopSignalCapture()
    })
  })

  it("bigint / 函数 throw 且带值描述（开发模式）", () => {
    withDevMode(() => {
      startSignalCapture()
      createSignal(1n)
      expect(() => serializeSignals()).toThrow(/signal #0.*bigint/)
      stopSignalCapture()
      startSignalCapture()
      createSignal(() => 1)
      expect(() => serializeSignals()).toThrow(/signal #0.*Function/)
      stopSignalCapture()
    })
  })

  it("嵌套在对象里的不可序列化值同样 throw（开发模式）", () => {
    withDevMode(() => {
      startSignalCapture()
      const outer: Record<string, unknown> = { deep: { fn: () => 1 } }
      createSignal(outer)
      expect(() => serializeSignals()).toThrow(/signal #0.*\.deep\.fn/)
      stopSignalCapture()
    })
  })

  it("开发模式:无法完美 JSON 化的值在序列化端标记 + 记录", () => {
    class Point {
      x = 1
    }
    withDevMode(() => {
      startSignalCapture()
      createSignal(undefined)
      createSignal(NaN)
      createSignal(new Date(0))
      createSignal(new Map([[1, 2]]))
      createSignal(new Point())
      const errors: string[] = []
      const orig = console.error
      console.error = (m: unknown) => errors.push(String(m))
      let payload: { l?: number[]; s: unknown[] }
      try {
        payload = JSON.parse(serializeSignals()) as { l?: number[]; s: unknown[] }
      } finally {
        console.error = orig
        stopSignalCapture()
      }
      // 全部不可完美转换 → 位置都被标记到 envelope.l
      expect(payload.l).toEqual([0, 1, 2, 3, 4])
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain("cannot be perfectly converted to JSON")
      expect(errors[0]).toContain("#4 Point instance")
    })
  })

  it("开发模式:纯 JSON 数据（有限数/string/boolean/null/纯对象/数组）不被标记", () => {
    withDevMode(() => {
      startSignalCapture()
      createSignal(0)
      createSignal("x")
      createSignal({ a: 1, b: ["n", null, true] })
      createSignal([1, { c: 2 }])
      const errors: string[] = []
      const orig = console.error
      console.error = (m: unknown) => errors.push(String(m))
      let payload: { l?: number[] }
      try {
        payload = JSON.parse(serializeSignals()) as { l?: number[] }
      } finally {
        console.error = orig
        stopSignalCapture()
      }
      expect(payload.l).toBeUndefined()
      expect(errors).toHaveLength(0)
    })
  })

  it("非调试模式（非开发 env）:默认只做纯 JSON,不校验不标记不报错", () => {
    startSignalCapture()
    createSignal(new Date(0))
    createSignal(undefined)
    createSignal({ a: 1 })
    const errors: string[] = []
    const orig = console.error
    console.error = (m: unknown) => errors.push(String(m))
    let payload: { l?: number[]; s: unknown[] }
    try {
      payload = JSON.parse(serializeSignals()) as { l?: number[]; s: unknown[] }
    } finally {
      console.error = orig
      stopSignalCapture()
    }
    // 无 l 标记、无报错;Date 降级为 ISO 字符串、undefined → null
    expect(payload.l).toBeUndefined()
    expect(errors).toHaveLength(0)
    expect(payload.s[0]).toBe("1970-01-01T00:00:00.000Z")
    expect(payload.s[1]).toBeNull()
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

describe("信号序列化 — 加固回归（#2 重入 / #5 有损补全 / #1 结构指纹）", () => {
  it("#2: 重入 startSignalCapture 不截断已捕获信号", () => {
    startSignalCapture()
    createSignal("first")
    const warns: string[] = []
    const orig = console.warn
    console.warn = (m: unknown) => warns.push(String(m))
    try {
      startSignalCapture() // 重入：no-op，保留首个会话已捕获的信号
    } finally {
      console.warn = orig
    }
    createSignal("second")
    try {
      const payload = JSON.parse(serializeSignals()) as { s: unknown[] }
      // 修复前：重入清空列表 → 只捕获到 "second"
      expect(payload.s).toEqual(["first", "second"])
      expect(warns.length).toBe(1)
    } finally {
      stopSignalCapture()
    }
  })

  it("客户端常驻:命中 envelope 的 l 标记即 throw(fail-fast),无需开发 env", () => {
    // 客户端无自己的开关、不读 env——只要信封带 l(由开发模式服务端产出),
    // 恢复逻辑常驻兑现并 throw。
    restoreSignals({ v: 1, s: ["2026-01-01"], l: [0] })
    expect(() => createSignal(new Date(0))).toThrow(/degraded/)
    stopSignalRestore()
  })

  it("envelope 无 l(生产服务端不产出)则照常降级恢复,不 throw", () => {
    // 生产服务端不跑无损 gate、不产出 l → 客户端常驻逻辑无从触发。
    restoreSignals({ v: 1, s: ["2026-01-01", "ok"] })
    expect(createSignal<unknown>(new Date(0)).get()).toBe("2026-01-01")
    createSignal("")
    stopSignalRestore()
  })

  it("codec encode 使类型化值不被标记;decode 在客户端还原类型", () => {
    const encode = (v: unknown): unknown =>
      v instanceof Date ? { $date: (v as Date).toISOString() } : v
    const decode = (v: unknown): unknown =>
      v !== null && typeof v === "object" && "$date" in v
        ? new Date((v as { $date: string }).$date)
        : v
    // 开发模式下跑服务端,证明 encode 让类型化值通过无损 gate(否则 Date 会被标 l)
    withDevMode(() => {
      setSignalStateCodec({ encode, decode })
      try {
        startSignalCapture()
        createSignal(new Date(0)) // 经 encode → {$date:"…"} 纯 JSON,不再判有损
        const payload = JSON.parse(serializeSignals()) as { s: unknown[]; l?: number[] }
        expect(payload.l).toBeUndefined()
        expect(payload.s[0]).toEqual({ $date: "1970-01-01T00:00:00.000Z" })
        stopSignalCapture()
        // 客户端:decode 把 tag 还原成 Date 作为 createSignal 初始值(常驻,无需 env)
        restoreSignals(JSON.stringify(payload))
        const d = createSignal(new Date(0)).get()
        expect(d).toBeInstanceOf(Date)
        expect((d as Date).getTime()).toBe(0)
        stopSignalRestore()
      } finally {
        setSignalStateCodec(null)
      }
    })
  })

  it("#1: 服务端纯对象顶替客户端类实例时报结构错位", () => {
    class User {
      name: string
      constructor(name: string) {
        this.name = name
      }
      greet(): string {
        return this.name
      }
    }
    // 服务端把 User 序列化为纯对象 {name}；客户端默认仍是类实例 → 方法会丢
    restoreSignals([{ name: "a" }])
    createSignal(new User("b"))
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
    expect(msg).toContain("#0: serialized object, client initial User instance")
  })

  it("#1: 纯对象之间仅 key 多少不同不误报（恢复本意）", () => {
    restoreSignals([{ a: 1, b: 2 }])
    createSignal({ a: 0 }) // 客户端默认少字段，属合法恢复，不得误报
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
