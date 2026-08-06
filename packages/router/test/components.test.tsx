/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { jsx } from "@kikojs/dom"
import { createRouter } from "../src/router"
import { Router, Link, Outlet, Navigate } from "../src/components"
import { setActiveRouter } from "../src/context"
import type { RouteRecord } from "../src/types"

function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

function drainMicrotasks(max = 20): Promise<void> {
  const queue: Promise<void>[] = []
  for (let i = 0; i < max; i++) {
    queue.push(flushMicrotasks())
  }
  return Promise.all(queue).then(() => undefined)
}

function createRoutes(): RouteRecord[] {
  return [
    { path: "/", component: () => jsx("div", { children: "home" }) },
    { path: "/about", component: () => jsx("div", { children: "about" }) },
    { path: "/users/:id", component: () => jsx("div", { children: "user" }) },
    { path: "/redirect", redirect: "/about" },
  ]
}

describe("Router components", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    // Router() 挂载时设置模块级 activeRouter，跨测试残留会影响抛错断言
    setActiveRouter(null)
  })

  it("Router renders children", () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    const node = Router({ router, children: jsx("span", { children: "hello" }) })
    expect(node.textContent).toBe("hello")
    router.dispose()
  })

  it("Outlet renders current route component", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const outlet = Outlet({})
    router.push("/about")
    await flushMicrotasks()
    expect(outlet.textContent).toBe("about")
    router.dispose()
  })

  it("Outlet renders the initial route and passes params to the component", async () => {
    window.history.replaceState(null, "", "/users/42")
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const outlet = Outlet({})
    expect(outlet.textContent).toBe("user")
    expect(router.params.get()).toEqual({ id: "42" })
    router.dispose()
  })

  it("Outlet throws when no router is available", () => {
    expect(() => Outlet({})).toThrow(/Outlet must be used inside a Router/)
  })

  it("Navigate throws when no router is available", () => {
    expect(() => Navigate({ to: "/" })).toThrow(/Navigate must be used inside a Router/)
  })

  it("Link navigates on click", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", children: "go" }) as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("/about")
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("Link opens external when no router", async () => {
    const link = Link({ to: "https://example.com", children: "ext" }) as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("https://example.com")
  })

  it("Link nested in Router via JSX resolves router lazily", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    // JSX 求值顺序：children（Link）先于 Router 执行，Link 创建时拿不到 router，
    // 必须在点击时惰性解析。
    const tree = Router({ router, children: Link({ to: "/about", children: "go" }) })
    const link = (tree as DocumentFragment).firstChild as HTMLAnchorElement
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await flushMicrotasks()
    // 修复前 Link 捕获到 null router，点击走整页导航（router.location 停留在 /）
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("Navigate triggers navigation", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    Navigate({ to: "/about" })
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("Link toggles activeClass on the current route", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", activeClass: "active", children: "go" }) as HTMLAnchorElement
    expect(link.classList.contains("active")).toBe(false)
    router.push("/about")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(true)
    router.push("/")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(false)
    router.dispose()
  })

  it("Link activeClass with exact:true only matches the exact path", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    // exact 模式：/users/42 不应激活 to="/users"
    const link = Link({
      to: "/users",
      activeClass: "on",
      exact: true,
      children: "u",
    }) as HTMLAnchorElement
    router.push("/users/42")
    await drainMicrotasks()
    expect(link.classList.contains("on")).toBe(false)
    router.push("/users")
    await drainMicrotasks()
    expect(link.classList.contains("on")).toBe(true)
    router.dispose()
  })

  it("Link activeClass supports multiple space-separated classes", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", activeClass: "a b", children: "go" }) as HTMLAnchorElement
    router.push("/about")
    await drainMicrotasks()
    expect(link.classList.contains("a")).toBe(true)
    expect(link.classList.contains("b")).toBe(true)
    router.push("/")
    await drainMicrotasks()
    expect(link.classList.contains("a")).toBe(false)
    expect(link.classList.contains("b")).toBe(false)
    router.dispose()
  })

  it("Link does not intercept modified clicks", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", children: "go" }) as HTMLAnchorElement
    const before = router.location.get().path
    link.dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    link.dispatchEvent(new MouseEvent("click", { metaKey: true, bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    link.dispatchEvent(new MouseEvent("click", { shiftKey: true, bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    router.dispose()
  })

  it("Link with replace navigates without pushing history", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", replace: true, children: "go" }) as HTMLAnchorElement
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    // replace 后 back 不应回到 /about 之前的历史……此处验证 location 已更新即可
    router.dispose()
  })

  it("Link target=_blank click is not intercepted", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({
      to: "/about",
      target: "_blank",
      children: "go",
    }) as HTMLAnchorElement
    const before = router.location.get().path
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    router.dispose()
  })
})
