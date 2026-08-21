import "./setup"
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { createRouter } from "../src/router"
import { createMemoryHistory } from "../src/history"
import type { RouteRecord, ScrollPosition } from "../src/types"

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

function frame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve())
  else queueMicrotask(resolve)
  return promise
}

async function waitFor(check: () => boolean, maxTicks = 300): Promise<void> {
  for (let i = 0; i < maxTicks && !check(); i++) {
    await flush()
    await frame()
  }
}

const routes: RouteRecord[] = [
  { path: "/", component: () => document.createTextNode("home") },
  { path: "/a", component: () => document.createTextNode("a") },
  { path: "/b", component: () => document.createTextNode("b") },
]

// happy-dom 的滚动是手动模拟：记录 scrollTo 调用、可注入 scrollY。
// 赋值处与 DOM 签名不同（只接受 options 形态），需要收窄。
const scrollToCalls: ScrollPosition[] = []
let fakeScrollY = 0

describe("scrollBehavior", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    scrollToCalls.length = 0
    fakeScrollY = 0
    window.scrollTo = ((o: ScrollPosition) => {
      scrollToCalls.push(o)
    }) as unknown as typeof window.scrollTo
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => fakeScrollY })
    Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 })
  })

  afterEach(() => {
    // 每个用例结束都应恢复浏览器默认（dispose 释放接管）
    expect(window.history.scrollRestoration).toBe("auto")
  })

  it("applies the returned position after programmatic navigation", async () => {
    const router = createRouter({
      mode: "path",
      routes,
      scrollBehavior: () => ({ top: 10, left: 5 }),
    })
    router.push("/a")
    await waitFor(() => scrollToCalls.length > 0)
    expect(scrollToCalls[0]).toMatchObject({ top: 10, left: 5 })
    router.dispose()
  })

  it("returning false skips scrolling", async () => {
    const router = createRouter({
      mode: "path",
      routes,
      scrollBehavior: () => false,
    })
    router.push("/a")
    // 给足微任务 + 帧机会，确认始终没有滚动调用
    for (let i = 0; i < 30; i++) {
      await flush()
      await frame()
    }
    expect(scrollToCalls.length).toBe(0)
    router.dispose()
  })

  it("passes savedPosition on back and applies its coordinates", async () => {
    const savedSeen: (ScrollPosition | null)[] = []
    // happy-dom 的 history.go 不恢复条目 state（真实浏览器会），
    // 因此 savedPosition 的往返用 memory history 验证。
    const history = createMemoryHistory("/")
    const router = createRouter({
      history,
      routes,
      scrollBehavior: (_to, _from, saved) => {
        savedSeen.push(saved)
        return saved ?? undefined
      },
    })
    // 落在 /a 后模拟用户滚动 → scroll 监听把位置写回当前条目
    router.push("/a")
    await waitFor(() => router.location.get().path === "/a")
    fakeScrollY = 100
    window.dispatchEvent(new Event("scroll"))
    await frame()
    await flush()

    router.push("/b")
    await waitFor(() => router.location.get().path === "/b")
    scrollToCalls.length = 0

    // memory history 的 go 直接变更信号，无需模拟 popstate
    router.back()
    await waitFor(() => router.location.get().path === "/a")
    await waitFor(() => scrollToCalls.length > 0)
    expect(savedSeen.at(-1)).toMatchObject({ top: 100, left: 0 })
    expect(scrollToCalls.at(-1)).toMatchObject({ top: 100, left: 0 })
    router.dispose()
    history.dispose()
  })

  it("el scrolls the element into view", async () => {
    const intoViewCalls: unknown[] = []
    // 无 Outlet 挂载：直接在 body 放一个可查询的目标元素；
    // spy 打在实例上（happy-dom 对 prototype 补丁的方法解析不生效）
    const target = document.createElement("div")
    target.id = "target"
    document.body.appendChild(target)
    target.scrollIntoView = ((arg?: unknown) => {
      intoViewCalls.push(arg)
    }) as unknown as typeof target.scrollIntoView

    const router = createRouter({
      mode: "path",
      routes,
      scrollBehavior: to => ({ el: to.hash ? `#${to.hash}` : "#target" }),
    })

    router.push("/anchor#target")
    await waitFor(() => intoViewCalls.length > 0)
    expect(intoViewCalls.length).toBeGreaterThan(0)
    router.dispose()
  })

  it("takes over scrollRestoration while active and restores on dispose", () => {
    const router = createRouter({ mode: "path", routes, scrollBehavior: () => false })
    expect(window.history.scrollRestoration).toBe("manual")
    router.dispose()
    expect(window.history.scrollRestoration).toBe("auto")
  })

  it("works with memory history", async () => {
    const history = createMemoryHistory("/")
    const router = createRouter({
      history,
      routes,
      scrollBehavior: () => ({ top: 7 }),
    })
    router.push("/a")
    await waitFor(() => scrollToCalls.length > 0)
    expect(scrollToCalls.at(-1)).toMatchObject({ top: 7 })
    // 条目滚动存取在 memory 实现里同样可用
    history.setEntryScroll({ top: 42, left: 0 })
    expect(history.getEntryScroll()).toEqual({ top: 42, left: 0 })
    router.dispose()
    history.dispose()
  })
})
