import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { createPathHistory, createHashHistory } from "../src/history"
import { createRouter } from "../src/router"
import type { RouteRecord } from "../src/types"

function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

const routes: RouteRecord[] = [
  { path: "/", component: () => document.createTextNode("home") },
  { path: "/search", component: () => document.createTextNode("search") },
]

// 两种 adapter 的方法语义必须完全一致，只有 URL 读写方式不同
describe("history adapters share identical method semantics", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("getPath returns path+query without fragment, getHash returns fragment", () => {
    window.history.replaceState(null, "", "/search?q=hello#frag")
    const pathHistory = createPathHistory()
    expect(pathHistory.getPath()).toBe("/search?q=hello")
    expect(pathHistory.getHash()).toBe("frag")

    window.history.replaceState(null, "", "#/search?q=hello")
    const hashHistory = createHashHistory()
    expect(hashHistory.getPath()).toBe("/search?q=hello")
    expect(hashHistory.getHash()).toBe("")
  })

  it("getPath/getHash default consistently when empty", () => {
    window.history.replaceState(null, "", "/")
    expect(createPathHistory().getPath()).toBe("/")
    expect(createPathHistory().getHash()).toBe("")

    window.history.replaceState(null, "", "#/")
    expect(createHashHistory().getPath()).toBe("/")
    expect(createHashHistory().getHash()).toBe("")
  })

  it("push writes the same path into mode-specific URLs", () => {
    const pathHistory = createPathHistory()
    pathHistory.push("/search?q=hello")
    expect(window.location.pathname + window.location.search).toBe("/search?q=hello")

    const hashHistory = createHashHistory()
    hashHistory.push("/search?q=hello")
    expect(window.location.hash).toBe("#/search?q=hello")
  })

  it("respects base in path mode only", () => {
    window.history.replaceState(null, "", "/app/search?q=1")
    const pathHistory = createPathHistory("/app")
    expect(pathHistory.getPath()).toBe("/search?q=1")
  })
})

describe("unified history semantics inside the router", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("hash mode parses query on initial load", () => {
    window.history.replaceState(null, "", "#/search?q=hello")
    const router = createRouter({ mode: "hash", routes })
    expect(router.location.get().path).toBe("/search")
    expect(router.query.get().q).toBe("hello")
    router.dispose()
  })

  it("hash mode parses a nested fragment (path#frag) without doubling the hash", () => {
    // 回归：曾出现 frag#frag 双 hash 与丢失 fragment 的 bug
    window.history.replaceState(null, "", "#/search?q=hello#frag")
    const router = createRouter({ mode: "hash", routes })
    expect(router.location.get().path).toBe("/search")
    expect(router.location.get().query.q).toBe("hello")
    expect(router.location.get().hash).toBe("frag")
    expect(router.location.get().fullPath).toBe("/search?q=hello#frag")
    router.dispose()
  })

  it("hash mode preserves nested fragment across navigation", async () => {
    window.history.replaceState(null, "", "#/")
    const router = createRouter({ mode: "hash", routes })
    router.push("/search?q=x#frag")
    await flushMicrotasks()
    expect(router.location.get().hash).toBe("frag")
    expect(window.location.hash).toBe("#/search?q=x#frag")
    router.dispose()
  })

  it("path mode preserves fragment on initial load and on popstate", async () => {
    window.history.replaceState(null, "", "/search?q=hello#frag")
    const router = createRouter({ mode: "path", routes })
    expect(router.location.get().path).toBe("/search")
    expect(router.location.get().query.q).toBe("hello")
    expect(router.location.get().hash).toBe("frag")

    window.dispatchEvent(new Event("popstate"))
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/search")
    expect(router.location.get().hash).toBe("frag")
    router.dispose()
  })

  it("hash mode listens via hashchange", async () => {
    window.history.replaceState(null, "", "#/")
    const router = createRouter({ mode: "hash", routes })
    window.location.hash = "#/search?q=hello"
    window.dispatchEvent(new Event("hashchange"))
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/search")
    expect(router.query.get().q).toBe("hello")
    router.dispose()
  })
})
