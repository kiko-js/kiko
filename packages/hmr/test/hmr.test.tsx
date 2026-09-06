import { describe, it, expect, beforeAll } from "bun:test"
// 接线后的运行时（`@kikojs/dom/hmr` 把 DOM 适配器注入 `@kikojs/hmr` 并安装）；
// 刻意走包名导入，覆盖发布后的真实解析路径（dist 接线 + 单例共享）。
import { installHmr } from "@kikojs/dom/hmr"
import { getHmrRegistry, type KikoHmrRegistry } from "@kikojs/hmr"
import { createSignal } from "@kikojs/dom"
import { render } from "@kikojs/dom"
import { jsx } from "@kikojs/dom/jsx-runtime"

beforeAll(async () => {
  await import("./setup")
  installHmr()
})

function flushMicro(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 5)
  return promise
}

interface Harness {
  hmr: KikoHmrRegistry
  container: HTMLElement
}

function setup(): Harness {
  const container = document.createElement("div")
  document.body.appendChild(container)
  return { hmr: installHmr(), container }
}

describe("hmr registry", () => {
  it("installs a singleton via the global symbol", () => {
    expect(getHmrRegistry()).toBe(installHmr())
  })

  it("keeps module-level signal identity and value across re-evaluation", () => {
    const { hmr } = setup()
    hmr.beginModule("store.ts")
    const first = createSignal(1)
    hmr.endModule("store.ts")
    hmr.beginModule("store.ts")
    const second = createSignal(999)
    hmr.endModule("store.ts")
    expect(second).toBe(first)
    expect(second.get()).toBe(1)
  })

  it("hot-swaps a component in place and restores internal signal values", async () => {
    const { hmr, container } = setup()
    const AppV1 = () => {
      const count = createSignal(5)
      return jsx("div", {
        children: [jsx("h1", { children: "v1" }), jsx("p", { children: ["count: ", count] })],
      })
    }
    const AppV2 = () => {
      const count = createSignal(0) // 初始值变了，但应恢复为 5
      return jsx("section", {
        children: [jsx("h2", { children: "v2" }), jsx("p", { children: ["count: ", count] })],
      })
    }

    hmr.beginModule("app.tsx")
    const wrapper = hmr.ref("app.tsx", "App", AppV1)
    hmr.endModule("app.tsx")
    render(jsx(wrapper as never, {}), container)
    expect(container.querySelector("h1")?.textContent).toBe("v1")
    expect(container.textContent).toContain("count: 5")

    hmr.beginModule("app.tsx")
    hmr.ref("app.tsx", "App", AppV2)
    hmr.endModule("app.tsx")
    hmr.moduleUpdated("app.tsx", null)
    await flushMicro()
    expect(container.querySelector("h1")).toBeNull()
    expect(container.querySelector("h2")?.textContent).toBe("v2")
    expect(container.textContent).toContain("count: 5")
  })

  it("preserves nested child component state via instance claiming", async () => {
    const { hmr, container } = setup()
    // counter 模块：内部信号 + 版本化实现
    const CounterV1 = () => {
      const count = createSignal(0)
      return jsx("div", { children: ["counter v1: ", count] })
    }
    const CounterV2 = () => {
      const count = createSignal(0)
      return jsx("div", { children: ["counter v2: ", count] })
    }
    // 入口模块：App 引用 counter 的包装（等价编译产物）
    const wCounter = hmr.ref("counter.tsx", "Counter", CounterV1)
    const App = () =>
      jsx("main", { children: [jsx("h1", { children: "app" }), jsx(wCounter as never, {})] })

    hmr.beginModule("counter.tsx")
    hmr.ref("counter.tsx", "Counter", CounterV1)
    hmr.endModule("counter.tsx")
    hmr.beginModule("client.tsx")
    const wApp = hmr.ref("client.tsx", "App", App)
    hmr.endModule("client.tsx")
    render(jsx(wApp as never, {}), container)

    // counter 模块更新：v2 实现换入
    hmr.beginModule("counter.tsx")
    hmr.ref("counter.tsx", "Counter", CounterV2)
    hmr.endModule("counter.tsx")
    hmr.moduleUpdated("counter.tsx", null)
    await flushMicro()
    expect(container.textContent).toContain("counter v2: 0")

    // 入口更新：render 重跑路径，App + Counter 全部认领
    const AppV2 = () =>
      jsx("main", { children: [jsx("h2", { children: "app2" }), jsx(wCounter as never, {})] })
    hmr.beginModule("client.tsx")
    hmr.ref("client.tsx", "App", AppV2)
    hmr.endModule("client.tsx")
    hmr.moduleUpdated("client.tsx", null)
    await flushMicro()
    expect(container.querySelector("h2")?.textContent).toBe("app2")
    expect(container.textContent).toContain("counter v2: 0")
  })

  it("unmounts instances of removed components", async () => {
    const { hmr, container } = setup()
    const App = () => jsx("p", { children: "app" })
    hmr.beginModule("app.tsx")
    const wrapper = hmr.ref("app.tsx", "App", App)
    hmr.endModule("app.tsx")
    render(jsx(wrapper as never, {}), container)
    expect(container.textContent).toBe("app")

    hmr.beginModule("app.tsx") // 重新求值但不再注册 App
    hmr.endModule("app.tsx")
    hmr.moduleUpdated("app.tsx", null)
    await flushMicro()
    expect(container.innerHTML).toBe("")
  })

  it("resets internal state when the signal kind changes", async () => {
    const { hmr, container } = setup()
    const V1 = () => {
      const value = createSignal(42)
      return jsx("p", { children: ["v: ", value] })
    }
    const V2 = () => {
      const value = createSignal("str") // 类型指纹变化 → 全新信号
      return jsx("p", { children: ["v: ", value] })
    }
    hmr.beginModule("app.tsx")
    const wrapper = hmr.ref("app.tsx", "App", V1)
    hmr.endModule("app.tsx")
    render(jsx(wrapper as never, {}), container)
    expect(container.textContent).toContain("v: 42")

    hmr.beginModule("app.tsx")
    hmr.ref("app.tsx", "App", V2)
    hmr.endModule("app.tsx")
    hmr.moduleUpdated("app.tsx", null)
    await flushMicro()
    expect(container.textContent).toContain("v: str")
  })

  it("swaps sibling instances without mixing their state", async () => {
    const { hmr, container } = setup()
    const Counter = ({ label }: { label: string }) => {
      const count = createSignal(0)
      return jsx("div", { children: [`${label}: `, count] })
    }
    hmr.beginModule("counter.tsx")
    const wrapper = hmr.ref("counter.tsx", "Counter", Counter) as never
    hmr.endModule("counter.tsx")
    render(
      jsx("main", { children: [jsx(wrapper, { label: "A" }), jsx(wrapper, { label: "B" })] }),
      container,
    )
    expect(container.textContent).toContain("A: 0")
    expect(container.textContent).toContain("B: 0")

    const CounterV2 = ({ label }: { label: string }) => {
      const count = createSignal(0)
      return jsx("span", { children: [`${label}! `, count] })
    }
    hmr.beginModule("counter.tsx")
    hmr.ref("counter.tsx", "Counter", CounterV2)
    hmr.endModule("counter.tsx")
    hmr.moduleUpdated("counter.tsx", null)
    await flushMicro()
    expect(container.textContent).toContain("A! 0")
    expect(container.textContent).toContain("B! 0")
    expect(container.querySelectorAll("div").length).toBe(0)
  })
})
