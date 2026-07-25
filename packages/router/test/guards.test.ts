import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { createRouter } from "../src/router"
import { createAuthGuard, combineGuards, createAsyncGuard } from "../src/guards"
import type { RouteRecord } from "../src/types"

function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

async function drainMicrotasks(max = 20): Promise<void> {
  for (let i = 0; i < max; i++) {
    await flushMicrotasks()
  }
}

function createRoutes(): RouteRecord[] {
  return [
    { path: "/", component: () => document.createTextNode("home") },
    { path: "/admin", component: () => document.createTextNode("admin") },
    { path: "/login", component: () => document.createTextNode("login") },
  ]
}

describe("guard helpers", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("createAuthGuard redirects when predicate returns false", async () => {
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: createAuthGuard(() => false, "/login"),
    })
    router.push("/admin")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/login")
    router.dispose()
  })

  it("createAuthGuard allows when predicate returns true", async () => {
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: createAuthGuard(() => true, "/login"),
    })
    router.push("/admin")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/admin")
    router.dispose()
  })

  it("createAuthGuard supports async predicate", async () => {
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: createAuthGuard(async () => false, "/login"),
    })
    router.push("/admin")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/login")
    router.dispose()
  })

  it("combineGuards stops at first interceptor", async () => {
    const calls: string[] = []
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: combineGuards(
        () => {
          calls.push("first")
          return true
        },
        to => {
          calls.push("second")
          return to.path === "/login" ? true : "/login"
        },
        () => {
          calls.push("third")
          return true
        },
      ),
    })
    router.push("/admin")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/login")
    expect(calls).toEqual(["first", "second", "first", "second", "third"])
    router.dispose()
  })

  it("createAsyncGuard redirects on failed check", async () => {
    const router = createRouter({
      mode: "path",
      routes: createRoutes(),
      beforeEach: createAsyncGuard(async () => false, "/login"),
    })
    router.push("/admin")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/login")
    router.dispose()
  })
})
