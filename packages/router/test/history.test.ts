import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { createPathHistory, createHashHistory, createMemoryHistory } from "../src/history"
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

// 三种 adapter 的方法语义必须完全一致，只有 URL 读写方式不同
describe("history adapters share identical method semantics", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("location.path carries path+query without fragment; location.hash the fragment", () => {
    window.history.replaceState(null, "", "/search?q=hello#frag")
    const pathHistory = createPathHistory()
    expect(pathHistory.location.get().path).toBe("/search?q=hello")
    expect(pathHistory.location.get().hash).toBe("frag")

    window.history.replaceState(null, "", "#/search?q=hello")
    const hashHistory = createHashHistory()
    expect(hashHistory.location.get().path).toBe("/search?q=hello")
    expect(hashHistory.location.get().hash).toBe("")
  })

  it("defaults consistently when empty", () => {
    window.history.replaceState(null, "", "/")
    expect(createPathHistory().location.get().path).toBe("/")
    expect(createHashHistory().location.get().path).toBe("/")

    const memory = createMemoryHistory()
    expect(memory.location.get().path).toBe("/")
    expect(memory.kind).toBe("memory")
  })

  it("push writes the same path into mode-specific URLs", () => {
    const pathHistory = createPathHistory()
    pathHistory.push("/search?q=hello")
    expect(window.location.pathname + window.location.search).toBe("/search?q=hello")
    expect(pathHistory.location.get().path).toBe("/search?q=hello")

    const hashHistory = createHashHistory()
    hashHistory.push("/search?q=hello")
    expect(window.location.hash).toBe("#/search?q=hello")
    expect(hashHistory.location.get().path).toBe("/search?q=hello")
  })

  it("respects base in path mode only", () => {
    window.history.replaceState(null, "", "/app/search?q=1")
    const pathHistory = createPathHistory("/app")
    expect(pathHistory.location.get().path).toBe("/search?q=1")
  })
})

describe("memory history", () => {
  it("push/go/back work entirely in memory", () => {
    const memory = createMemoryHistory("/")
    memory.push("/a")
    memory.push("/b")
    expect(memory.location.get().path).toBe("/b")
    memory.go(-1)
    expect(memory.location.get().path).toBe("/a")
    memory.go(-2) // clamps at the first entry
    expect(memory.location.get().path).toBe("/")
    memory.go(5) // clamps at the last entry
    expect(memory.location.get().path).toBe("/b")
    memory.back()
    expect(memory.location.get().path).toBe("/a")
  })

  it("go beyond the stack does not emit a new location", () => {
    const memory = createMemoryHistory("/")
    const before = memory.location.get()
    memory.go(3)
    expect(memory.location.get()).toBe(before)
  })

  it("replace overwrites the current entry", () => {
    const memory = createMemoryHistory("/")
    memory.push("/a", { n: 1 })
    memory.replace("/b", { n: 2 })
    expect(memory.location.get().path).toBe("/b")
    expect(memory.location.get().state).toEqual({ n: 2 })
    memory.go(-1)
    expect(memory.location.get().path).toBe("/")
    memory.go(1)
    expect(memory.location.get().path).toBe("/b")
  })

  it("splits a hash fragment out of the pushed path", () => {
    const memory = createMemoryHistory()
    memory.push("/docs/intro#section-2")
    expect(memory.location.get().path).toBe("/docs/intro")
    expect(memory.location.get().hash).toBe("section-2")
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
