import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { createRouter } from "../src/router"
import type { RouteRecord } from "../src/types"

function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
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
