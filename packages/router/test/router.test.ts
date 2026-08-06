import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { createRouter } from "../src/router"
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
    { path: "/", component: () => document.createTextNode("home") },
    { path: "/about", component: () => document.createTextNode("about") },
    {
      path: "/users/:id",
      component: () => document.createTextNode("user"),
      children: [{ path: "profile", component: () => document.createTextNode("profile") }],
    },
    { path: "/search", component: () => document.createTextNode("search") },
    { path: "/old", redirect: "/about" },
  ]
}

describe("createRouter path mode", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("initializes with current path", () => {
    window.history.replaceState(null, "", "/about")
    const router = createRouter({ mode: "path", routes: createRoutes() })
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("navigates to a path", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/about")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    expect(window.location.pathname).toBe("/about")
    router.dispose()
  })

  it("replaces current path", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.replace("/about")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("parses params", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/users/42")
    await flushMicrotasks()
    expect(router.params.get()).toEqual({ id: "42" })
    expect(router.currentRoute.get()?.path).toBe("/users/:id")
    router.dispose()
  })

  it("parses query", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/search?q=hello&tag=a&tag=b")
    await flushMicrotasks()
    expect(router.query.get().q).toBe("hello")
    expect(router.query.get().tag).toEqual(["a", "b"])
    router.dispose()
  })

  it("redirects via route redirect", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/old")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("runs global beforeEach guard", async () => {
    const visited: string[] = []
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: to => {
        visited.push(to.path)
        return true
      },
    })
    router.push("/about")
    await flushMicrotasks()
    expect(visited).toContain("/about")
    router.dispose()
  })

  it("blocks navigation when guard returns false", async () => {
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: to => to.path !== "/about",
    })
    router.push("/about")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/")
    router.dispose()
  })

  it("redirects when guard returns string", async () => {
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: to => (to.path === "/forbidden" ? "/" : true),
    })
    router.push("/forbidden")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/")
    router.dispose()
  })

  it("runs afterEach hook", async () => {
    const visited: string[] = []
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      afterEach: [to => visited.push(to.path)],
    })
    router.push("/about")
    await flushMicrotasks()
    expect(visited).toContain("/about")
    router.dispose()
  })

  it("matches nested routes", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/users/99/profile")
    await flushMicrotasks()
    expect(router.params.get()).toEqual({ id: "99" })
    expect(router.matched.get().map(r => r.route.path)).toEqual(["/users/:id", "profile"])
    router.dispose()
  })

  it("runs route-level beforeEnter guard and blocks", async () => {
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", component: () => document.createTextNode("home") },
        { path: "/admin", beforeEnter: () => false, component: () => document.createTextNode("x") },
      ],
    })
    router.push("/admin")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/")
    router.dispose()
  })

  it("route-level beforeEnter can redirect via string", async () => {
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", component: () => document.createTextNode("home") },
        {
          path: "/admin",
          beforeEnter: () => "/",
          component: () => document.createTextNode("x"),
        },
      ],
    })
    router.push("/admin")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/")
    router.dispose()
  })

  it("runs beforeLeave on the old route and can block navigation", async () => {
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", beforeLeave: () => false, component: () => document.createTextNode("home") },
        { path: "/about", component: () => document.createTextNode("about") },
      ],
    })
    router.push("/about")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/")
    router.dispose()
  })

  it("beforeLeave receives the navigation target", async () => {
    const targets: string[] = []
    const router = createRouter({
      mode: "path",
      routes: [
        {
          path: "/",
          beforeLeave: to => {
            targets.push(to.path)
            return true
          },
          component: () => document.createTextNode("home"),
        },
        { path: "/about", component: () => document.createTextNode("about") },
      ],
    })
    router.push("/about")
    await flushMicrotasks()
    expect(targets).toEqual(["/about"])
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("supports function redirect", async () => {
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/old", redirect: () => "/new", component: () => document.createTextNode("x") },
        { path: "/new", component: () => document.createTextNode("new") },
      ],
    })
    router.push("/old")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/new")
    router.dispose()
  })

  it("throws after too many redirects instead of looping forever", async () => {
    const reported: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => reported.push(e)
    try {
      const router = createRouter({
        mode: "path",
        routes: [
          { path: "/a", redirect: "/b", component: () => document.createTextNode("a") },
          { path: "/b", redirect: "/a", component: () => document.createTextNode("b") },
        ],
      })
      router.push("/a")
      for (let i = 0; i < 20; i++) await flushMicrotasks()
      expect(reported.length).toBeGreaterThan(0)
      expect((reported[0] as Error).message).toMatch(/Too many redirects/)
      router.dispose()
    } finally {
      globalThis.reportError = prevReport
    }
  })

  it("passes state through navigate and location", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/about", { from: "test" })
    await flushMicrotasks()
    expect(router.location.get().state).toEqual({ from: "test" })
    router.dispose()
  })

  it("back/forward/go delegate to history (popstate drives location)", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/about")
    await flushMicrotasks()
    router.push("/search")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/search")
    // happy-dom 的 history.back() 会更新 location 但不派发 popstate；
    // 手动派发模拟浏览器历史导航（与 history.test.ts 同模式）。
    router.back()
    expect(window.location.pathname).toBe("/about")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.forward()
    expect(window.location.pathname).toBe("/search")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/search")
    router.go(-1)
    expect(window.location.pathname).toBe("/about")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("navigate accepts a number (history delta)", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/about")
    await flushMicrotasks()
    router.navigate(-1)
    expect(window.location.pathname).toBe("/")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/")
    router.dispose()
  })

  it("dispose stops listening to history", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/about")
    await flushMicrotasks()
    router.dispose()
    window.history.pushState(null, "", "/search")
    window.dispatchEvent(new Event("popstate"))
    await flushMicrotasks()
    // dispose 后 popstate 不再更新 location
    expect(router.location.get().path).toBe("/about")
  })
})

describe("createRouter hash mode", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/")
  })

  it("initializes with current hash", () => {
    window.location.hash = "#/about"
    const router = createRouter({ mode: "hash", routes: createRoutes() })
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("navigates via hash", async () => {
    const router = createRouter({ mode: "hash", routes: createRoutes() })
    router.push("/about")
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    expect(window.location.hash).toBe("#/about")
    router.dispose()
  })
})
