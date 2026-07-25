/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { jsx } from "@kikojs/dom"
import { createRouter } from "../src/router"
import { Router, Link, Outlet, Navigate } from "../src/components"
import type { RouteRecord } from "../src/types"

function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
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

  it("Navigate triggers navigation", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    Navigate({ to: "/about" })
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })
})
