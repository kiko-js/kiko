import { describe, it, expect, beforeEach } from "bun:test"
import {
  connectHmr,
  ensureHmrClient,
  resetHmrClient,
  acceptHmrModule,
  resolveHmrEndpoint,
  type HmrEventSourceLike,
  type HmrWebSocketLike,
} from "../src/client"
import { encodeHmrMessage } from "../src/protocol"
import type { KikoHmrRegistry } from "../src/contract"

class FakeEventSource implements HmrEventSourceLike {
  static instances: FakeEventSource[] = []
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  closed = false
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }
  close(): void {
    this.closed = true
  }
  open(): void {
    this.onopen?.({})
  }
  emit(data: string): void {
    this.onmessage?.({ data })
  }
  fail(): void {
    this.onerror?.({})
  }
}

class FakeWebSocket implements HmrWebSocketLike {
  static instances: FakeWebSocket[] = []
  readyState = 0
  readonly sent: string[] = []
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>()
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.readyState = 3
    this.dispatch("close", {})
  }
  addEventListener(type: "open" | "message" | "close" | "error", listener: (e: unknown) => void) {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }
  open(): void {
    this.readyState = 1
    this.dispatch("open", {})
  }
  emit(data: unknown): void {
    this.dispatch("message", { data })
  }
  fail(): void {
    this.dispatch("error", {})
  }
  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function tick(ms = 5): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

beforeEach(() => {
  FakeEventSource.instances = []
  FakeWebSocket.instances = []
  resetHmrClient()
})

describe("connectHmr", () => {
  it("defaults to SSE against the resolved endpoint", () => {
    const client = connectHmr({
      url: "http://example.test/hmr",
      createEventSource: url => new FakeEventSource(url),
    })
    expect(client.transport).toBe("sse")
    expect(FakeEventSource.instances.length).toBe(1)
    expect(FakeEventSource.instances[0]!.url).toBe("http://example.test/hmr")

    const statuses: string[] = []
    const client2 = connectHmr({
      url: "http://example.test/hmr",
      createEventSource: url => new FakeEventSource(url),
      onStatus: status => statuses.push(status),
    })
    FakeEventSource.instances[1]!.open()
    expect(client2.status).toBe("connected")
    expect(statuses).toEqual(["connecting", "connected"])

    const updates: string[][] = []
    client2.on("update", message => updates.push(message.modules))
    FakeEventSource.instances[1]!.emit(encodeHmrMessage({ type: "update", modules: ["a.tsx"] }))
    expect(updates).toEqual([["a.tsx"]])

    client.close()
    client2.close()
  })

  it("connects over WebSocket when requested", () => {
    const client = connectHmr({
      url: "http://example.test/hmr",
      transport: "ws",
      createWebSocket: url => new FakeWebSocket(url),
    })
    const socket = FakeWebSocket.instances[0]!
    expect(client.transport).toBe("ws")
    expect(socket.url).toBe("ws://example.test/hmr")

    socket.open()
    expect(client.status).toBe("connected")
    client.send({ type: "hello", version: 1 })
    expect(socket.sent).toEqual([encodeHmrMessage({ type: "hello", version: 1 })])

    const reloads: string[] = []
    client.on("reload", message => reloads.push(message.reason ?? ""))
    socket.emit(encodeHmrMessage({ type: "reload", reason: "graph" }))
    expect(reloads).toEqual(["graph"])
    client.close()
  })

  it("falls back from WebSocket to SSE when the socket fails to open", async () => {
    const client = connectHmr({
      url: "http://example.test/hmr",
      transport: "auto",
      minReconnectDelayMs: 1,
      maxReconnectDelayMs: 2,
      createWebSocket: url => new FakeWebSocket(url),
      createEventSource: url => new FakeEventSource(url),
    })
    expect(client.transport).toBe("ws")
    FakeWebSocket.instances[0]!.fail()
    expect(client.transport).toBe("sse")
    expect(FakeEventSource.instances.length).toBe(1)
    // 回落不应顺带排一次 WS 重连。
    await tick(15)
    expect(FakeWebSocket.instances.length).toBe(1)
    client.close()
  })

  it("reconnects after a dropped SSE connection", async () => {
    const client = connectHmr({
      url: "http://example.test/hmr",
      minReconnectDelayMs: 1,
      maxReconnectDelayMs: 2,
      createEventSource: url => new FakeEventSource(url),
    })
    FakeEventSource.instances[0]!.fail()
    await tick(15)
    expect(FakeEventSource.instances.length).toBeGreaterThan(1)
    client.close()
  })

  it("POSTs client messages when the transport is SSE", async () => {
    const original = globalThis.fetch
    const calls: { url: string; body: string }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) })
      return new Response(null, { status: 204 })
    }) as typeof fetch
    try {
      const client = connectHmr({
        url: "http://example.test/hmr",
        createEventSource: url => new FakeEventSource(url),
      })
      FakeEventSource.instances[0]!.open()
      client.send({ type: "hello" })
      await tick()
      expect(calls).toEqual([{ url: "http://example.test/hmr", body: '{"type":"hello"}' }])
      client.close()
    } finally {
      globalThis.fetch = original
    }
  })
})

describe("resolveHmrEndpoint", () => {
  it("keeps explicit urls and defaults to /hmr", () => {
    expect(resolveHmrEndpoint("http://x/custom")).toBe("http://x/custom")
    expect(resolveHmrEndpoint()).toContain("/hmr")
  })
})

function fakeRegistry(): KikoHmrRegistry & { updates: [string, unknown][] } {
  const updates: [string, unknown][] = []
  const registry = {
    updates,
    beginModule() {},
    endModule() {},
    ref(_moduleId: string, _name: string, impl: unknown) {
      return impl
    },
    moduleUpdated(moduleId: string, mod: unknown) {
      updates.push([moduleId, mod])
    },
    takeSignal() {
      return null
    },
  }
  return registry
}

describe("ensureHmrClient / acceptHmrModule", () => {
  it("is a global singleton and re-imports unmanaged modules", async () => {
    const registry = fakeRegistry()
    const loaded: string[] = []
    const applied = ensureHmrClient({
      url: "http://example.test/hmr",
      registry,
      createEventSource: url => new FakeEventSource(url),
      loadModule: async url => {
        loaded.push(url)
        return { tag: "fresh" }
      },
    })
    expect(ensureHmrClient()).toBe(applied)
    expect(acceptHmrModule("src/counter.tsx", { url: "http://example.test/counter.tsx" })).toBe(
      applied,
    )

    FakeEventSource.instances[0]!.emit(
      encodeHmrMessage({ type: "update", modules: ["src/counter.tsx"] }),
    )
    await tick()
    expect(loaded.length).toBe(1)
    expect(loaded[0]).toContain("http://example.test/counter.tsx")
    expect(loaded[0]).toContain("kiko-hmr=")
    expect(registry.updates).toEqual([["src/counter.tsx", { tag: "fresh" }]])
    applied.close()
  })

  it("leaves bundler-managed modules to import.meta.hot", async () => {
    const registry = fakeRegistry()
    let loaded = 0
    const applied = ensureHmrClient({
      url: "http://example.test/hmr",
      registry,
      createEventSource: url => new FakeEventSource(url),
      loadModule: async () => {
        loaded++
        return {}
      },
    })
    applied.register("src/app.tsx", { url: "http://example.test/app.tsx", managed: true })
    FakeEventSource.instances[0]!.emit(
      encodeHmrMessage({ type: "update", modules: ["src/app.tsx"] }),
    )
    await tick()
    expect(loaded).toBe(0)
    expect(registry.updates).toEqual([])
    applied.close()
  })

  it("routes reload messages to the configured handler", async () => {
    const reloads: string[] = []
    const applied = ensureHmrClient({
      url: "http://example.test/hmr",
      registry: fakeRegistry(),
      createEventSource: url => new FakeEventSource(url),
      onReload: message => reloads.push(message.reason ?? ""),
    })
    FakeEventSource.instances[0]!.emit(encodeHmrMessage({ type: "reload", reason: "boom" }))
    await tick()
    expect(reloads).toEqual(["boom"])
    applied.close()
  })

  it("reports re-import failures instead of throwing", async () => {
    const failures: string[] = []
    const applied = ensureHmrClient({
      url: "http://example.test/hmr",
      registry: fakeRegistry(),
      createEventSource: url => new FakeEventSource(url),
      loadModule: async () => {
        throw new Error("nope")
      },
      onError: (_error, moduleId) => failures.push(moduleId),
    })
    applied.register("src/x.tsx", { url: "http://example.test/x.tsx" })
    FakeEventSource.instances[0]!.emit(encodeHmrMessage({ type: "update", modules: ["src/x.tsx"] }))
    await tick()
    expect(failures).toEqual(["src/x.tsx"])
    applied.close()
  })
})
