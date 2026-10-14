import { afterEach, describe, expect, it } from "bun:test"
import {
  appendQueryParam,
  cacheBustUrl,
  DEV_CACHE_PARAM,
  devFetch,
  isDevMode,
  NO_CACHE_HEADERS,
  noCacheHeaders,
  withNoCache,
} from "../src/cache"

const realFetch = globalThis.fetch
const realNodeEnv = process.env.NODE_ENV

function setNodeEnv(value: string | undefined): void {
  if (value === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = value
}

interface Call {
  url: string
  init?: RequestInit
}

function stubFetch(calls: Call[]): void {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
    calls.push({ url, init })
    return new Response("ok")
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  setNodeEnv(realNodeEnv)
})

describe("isDevMode", () => {
  it("treats everything but explicit production as development", () => {
    setNodeEnv("development")
    expect(isDevMode()).toBe(true)
    setNodeEnv("test")
    expect(isDevMode()).toBe(true)
    setNodeEnv(undefined)
    expect(isDevMode()).toBe(true)
    setNodeEnv("production")
    expect(isDevMode()).toBe(false)
  })
})

describe("appendQueryParam", () => {
  it("keeps existing query and hash while choosing ? / &", () => {
    expect(appendQueryParam("/hmr", "t", 1)).toBe("/hmr?t=1")
    expect(appendQueryParam("/hmr?x=1", "t", 2)).toBe("/hmr?x=1&t=2")
    expect(appendQueryParam("/hmr?", "t", 3)).toBe("/hmr?t=3")
    expect(appendQueryParam("/hmr#top", "t", 4)).toBe("/hmr?t=4#top")
    expect(appendQueryParam("/hmr?x=1#top", "t", 5)).toBe("/hmr?x=1&t=5#top")
  })

  it("encodes the name and value", () => {
    expect(appendQueryParam("/x", "a b", "c&d")).toBe("/x?a%20b=c%26d")
  })
})

describe("cacheBustUrl", () => {
  it("appends a timestamp param only in development", () => {
    expect(cacheBustUrl("/api/board", { dev: true, stamp: 7 })).toBe("/api/board?kiko-dev=7")
    expect(cacheBustUrl("/api/board", { dev: false, stamp: 7 })).toBe("/api/board")
    expect(cacheBustUrl("/api/board?x=1", { dev: true, stamp: 8 })).toBe(
      "/api/board?x=1&kiko-dev=8",
    )
  })

  it("supports a custom param and a clock function", () => {
    let now = 100
    expect(cacheBustUrl("/x", { dev: true, stamp: () => ++now, param: "t" })).toBe("/x?t=101")
    expect(cacheBustUrl("/x", { dev: true, stamp: () => ++now, param: "t" })).toBe("/x?t=102")
  })

  it("follows NODE_ENV when dev is not given", () => {
    setNodeEnv("production")
    expect(cacheBustUrl("/x", { stamp: 1 })).toBe("/x")
    setNodeEnv("development")
    expect(cacheBustUrl("/x", { stamp: 1 })).toBe(`/x?${DEV_CACHE_PARAM}=1`)
  })
})

describe("devFetch", () => {
  it("stamps GET requests and disables the HTTP cache in development", async () => {
    const calls: Call[] = []
    stubFetch(calls)
    await devFetch("/api/board", undefined, { dev: true, stamp: 11 })
    expect(calls.length).toBe(1)
    expect(calls[0]!.url).toBe("/api/board?kiko-dev=11")
    expect(calls[0]!.init?.cache).toBe("no-store")
  })

  it("passes through untouched in production", async () => {
    const calls: Call[] = []
    stubFetch(calls)
    const init = { method: "GET", headers: { accept: "application/json" } }
    await devFetch("/api/board", init, { dev: false, stamp: 11 })
    expect(calls[0]!.url).toBe("/api/board")
    expect(calls[0]!.init).toBe(init)
    expect(calls[0]!.init?.cache).toBeUndefined()
  })

  it("does not stamp non-GET requests but still forbids caching", async () => {
    const calls: Call[] = []
    stubFetch(calls)
    await devFetch("/api/todos", { method: "POST", body: "{}" }, { dev: true, stamp: 12 })
    expect(calls[0]!.url).toBe("/api/todos")
    expect(calls[0]!.init?.cache).toBe("no-store")
    expect(calls[0]!.init?.body).toBe("{}")
  })

  it("rebuilds Request inputs with a stamped URL", async () => {
    const calls: Call[] = []
    stubFetch(calls)
    const original = new Request("http://example.test/api/board")
    await devFetch(original, undefined, { dev: true, stamp: 13 })
    expect(calls[0]!.url).toBe("http://example.test/api/board?kiko-dev=13")
    expect(original.url).toBe("http://example.test/api/board")
  })

  it("follows NODE_ENV by default", async () => {
    const calls: Call[] = []
    stubFetch(calls)
    setNodeEnv("production")
    await devFetch("/x", undefined, { stamp: 14 })
    expect(calls[0]!.url).toBe("/x")
    setNodeEnv("development")
    await devFetch("/x", undefined, { stamp: 14 })
    expect(calls[1]!.url).toBe("/x?kiko-dev=14")
  })

  it("rejects when no fetch implementation exists", async () => {
    const global = globalThis as { fetch?: typeof fetch }
    global.fetch = undefined
    await expect(devFetch("/x", undefined, { dev: true })).rejects.toThrow("fetch is unavailable")
  })
})

describe("noCacheHeaders / withNoCache", () => {
  it("always wins over extra headers", () => {
    const headers = noCacheHeaders({ "cache-control": "max-age=600", "x-extra": "1" })
    expect(headers.get("cache-control")).toBe(NO_CACHE_HEADERS["cache-control"]!)
    expect(headers.get("pragma")).toBe("no-cache")
    expect(headers.get("expires")).toBe("0")
    expect(headers.get("x-extra")).toBe("1")
  })

  it("copies a response with cache disabled but other headers kept", async () => {
    const response = withNoCache(
      new Response("body", { status: 201, headers: { "content-type": "application/json" } }),
    )
    expect(response.status).toBe(201)
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(await response.text()).toBe("body")
  })

  it("handles bodyless statuses", async () => {
    const response = withNoCache(new Response(null, { status: 204 }))
    expect(response.status).toBe(204)
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("accepts extra headers", () => {
    const response = withNoCache(new Response("ok"), { "x-dev": "1" })
    expect(response.headers.get("x-dev")).toBe("1")
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
})
