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

  it("matches nested routes under a root / route (regression)", async () => {
    // 根路由 "/" 的 prefixRegex 只消费 "/"：修复前 consumed 被剥成空串，
    // slice(-1) 吃掉剩余路径的首字符，children 永远匹配不上。
    const router = createRouter({
      mode: "path",
      routes: [
        {
          path: "/",
          component: () => document.createTextNode("layout"),
          children: [{ path: "inner", component: () => document.createTextNode("inner") }],
        },
      ],
    })
    router.push("/inner")
    await flushMicrotasks()
    expect(router.matched.get().map(r => r.route.path)).toEqual(["/", "inner"])
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

  it("runs guards on initial load and redirects before first paint", async () => {
    window.history.replaceState(null, "", "/admin")
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", component: () => document.createTextNode("home") },
        { path: "/login", component: () => document.createTextNode("login") },
        { path: "/admin", component: () => document.createTextNode("admin") },
      ],
      beforeEach: to => (to.path === "/admin" ? "/login" : true),
    })
    // 深链初始即命中受保护页面：首帧 location 是 /admin，
    // 守卫在微任务中落地重定向（早于浏览器绘制）。
    expect(router.location.get().path).toBe("/admin")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/login")
    expect(window.location.pathname).toBe("/login")
    router.dispose()
  })

  it("keeps the initial location when guards pass", async () => {
    window.history.replaceState(null, "", "/about")
    const router = createRouter({ mode: "path", routes: createRoutes() })
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("applies route-level redirect on initial load", async () => {
    window.history.replaceState(null, "", "/")
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", redirect: "/home", component: () => document.createTextNode("x") },
        { path: "/home", component: () => document.createTextNode("home") },
      ],
    })
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/home")
    router.dispose()
  })

  it("discards a stale initial-guard redirect once navigation started", async () => {
    window.history.replaceState(null, "", "/admin")
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", component: () => document.createTextNode("home") },
        { path: "/login", component: () => document.createTextNode("login") },
        { path: "/admin", component: () => document.createTextNode("admin") },
      ],
      beforeEach: async to => {
        await Promise.resolve() // 延迟守卫，制造竞态窗口
        return to.path === "/admin" ? "/login" : true
      },
    })
    // 初始守卫未返回时用户先导航——初始守卫的迟到重定向必须被丢弃
    router.push("/home")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/home")
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

describe("guard result validation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("reports an invalid global beforeEach result", async () => {
    const reported: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => reported.push(e)
    let router: ReturnType<typeof createRouter> | undefined
    try {
      router = createRouter({
        mode: "path",
        routes: createRoutes(),
        beforeEach: () => ({}) as never,
      })
      router.push("/about")
      await drainMicrotasks()
      expect(reported.length).toBeGreaterThan(0)
      expect((reported[0] as Error).message).toMatch(/Invalid guard result/)
      expect(router.location.get().path).toBe("/")
    } finally {
      globalThis.reportError = prevReport
      router?.dispose()
    }
  })

  it("reports an invalid route-level beforeEnter result", async () => {
    const reported: unknown[] = []
    const prevReport = globalThis.reportError
    globalThis.reportError = (e: unknown) => reported.push(e)
    let router: ReturnType<typeof createRouter> | undefined
    try {
      router = createRouter({
        mode: "path",
        routes: [
          { path: "/", component: () => document.createTextNode("home") },
          {
            path: "/admin",
            beforeEnter: () => ({}) as never,
            component: () => document.createTextNode("admin"),
          },
        ],
      })
      router.push("/admin")
      await drainMicrotasks()
      expect(reported.length).toBeGreaterThan(0)
      expect((reported[0] as Error).message).toMatch(/Invalid guard result/)
      expect(router.location.get().path).toBe("/")
    } finally {
      globalThis.reportError = prevReport
      router?.dispose()
    }
  })
})

describe("popstate guards and hooks", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("runs afterEach on an accepted popstate", async () => {
    const visited: string[] = []
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      afterEach: [to => visited.push(to.path)],
    })
    window.history.pushState(null, "", "/about")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/about")
    expect(visited).toContain("/about")
    router.dispose()
  })

  it("blocks a protected popstate and does not run afterEach", async () => {
    const visited: string[] = []
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: to => to.path !== "/about",
      afterEach: [to => visited.push(to.path)],
    })
    window.history.pushState(null, "", "/about")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/")
    expect(window.location.pathname).toBe("/")
    expect(visited).toEqual([])

    // happy-dom 不会为 history.go(-1) 自动派发 popstate；模拟浏览器的补偿事件。
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()

    // 补偿事件后，下一次真实 popstate 不应被吞掉。
    window.history.pushState(null, "", "/search")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/search")
    router.dispose()
  })

  it("redirects a protected popstate and runs afterEach with the target", async () => {
    const visited: string[] = []
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", component: () => document.createTextNode("home") },
        { path: "/login", component: () => document.createTextNode("login") },
        { path: "/admin", component: () => document.createTextNode("admin") },
      ],
      beforeEach: to => (to.path === "/admin" ? "/login" : true),
      afterEach: [to => visited.push(to.path)],
    })
    window.history.pushState(null, "", "/admin")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/login")
    expect(window.location.pathname).toBe("/login")
    expect(visited).toContain("/login")
    router.dispose()
  })

  it("reads state from history on popstate", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    // a real history entry carries an arbitrary state object; the popstate
    // handler must read it via history.getState() instead of ignoring it.
    window.history.pushState({ token: "abc" }, "", "/about")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/about")
    expect(router.location.get().state).toEqual({ token: "abc" })
    router.dispose()
  })
})

describe("navigation dedup (R5 first half)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("does not push a duplicate history entry for the same fullPath", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/about")
    await flushMicrotasks()
    const lenAfterFirst = window.history.length
    // same fullPath, not replace → commit early-returns (no second pushState)
    router.push("/about")
    await flushMicrotasks()
    expect(window.history.length).toBe(lenAfterFirst)
    // a single back therefore returns to the root, not to a duplicated entry
    router.back()
    expect(window.location.pathname).toBe("/")
    window.dispatchEvent(new Event("popstate"))
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/")
    router.dispose()
  })

  it("query-only change still navigates (fullPath differs)", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    router.push("/search?q=one")
    await flushMicrotasks()
    const lenAfterFirst = window.history.length
    router.push("/search?q=two")
    await flushMicrotasks()
    // distinct fullPath → a new history entry is created
    expect(window.history.length).toBe(lenAfterFirst + 1)
    expect(router.query.get().q).toBe("two")
    router.dispose()
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
