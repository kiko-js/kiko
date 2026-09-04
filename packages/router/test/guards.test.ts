import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { createRouter } from "../src/router"
import { createAuthGuard, combineGuards } from "../src/guards"
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

async function waitFor(check: () => boolean, maxTicks = 200): Promise<void> {
  for (let i = 0; i < maxTicks && !check(); i++) {
    await flushMicrotasks()
  }
}

/** Wait until `calls` stops growing — concurrent guard rounds trickle in.
 * Requires several consecutive stable ticks: a single stable tick is not
 * enough, promise chains have multi-tick gaps between pushes. */
async function settleCalls(calls: string[], stableTicks = 10, maxTicks = 500): Promise<void> {
  let prev = -1
  let stable = 0
  for (let i = 0; i < maxTicks && stable < stableTicks; i++) {
    if (calls.length === prev) {
      stable++
    } else {
      stable = 0
      prev = calls.length
    }
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
    // 从 /login 起步：初始守卫轮完整通过（first,second,third），无重定向链，
    // 等它静止后清空记录，后续序列完全确定。
    window.history.replaceState(null, "", "/login")
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
    await settleCalls(calls)
    expect(calls).toEqual(["first", "second", "third"])
    calls.length = 0

    // /admin 被 second 重定向：该轮 third 不执行；重定向目标的
    // commit 再完整跑一轮守卫（first,second,third）。
    router.push("/admin")
    await waitFor(() => router.location.get().path === "/login")
    await settleCalls(calls)
    expect(router.location.get().path).toBe("/login")
    expect(calls).toEqual(["first", "second", "first", "second", "third"])
    router.dispose()
  })
})
