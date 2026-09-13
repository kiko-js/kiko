import { describe, it, expect } from "bun:test"
import { createServer, type Server } from "node:http"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  bindHmrSocket,
  createNodeHmr,
  toNodeListener,
  toModuleId,
  type NodeSocketLike,
} from "../src/node/index"
import { decodeHmrMessage } from "../src/protocol"

function dataOf(frame: string): string {
  const line = frame.split("\n").find(l => l.startsWith("data: "))
  return line ? line.slice("data: ".length) : ""
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout")
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("no port")
  return address.port
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>(resolve => server.close(() => resolve()))
}

class FakeSocket implements NodeSocketLike {
  readonly sent: string[] = []
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.emit("close")
  }
  on(event: string, listener: (...args: unknown[]) => void): unknown {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return this
  }
  off(event: string, listener: (...args: unknown[]) => void): unknown {
    this.listeners.get(event)?.delete(listener)
    return this
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args)
  }
}

describe("toModuleId", () => {
  it("is re-exported for adapter parity with bun", () => {
    expect(toModuleId("/app", "/app/src/counter.tsx")).toBe("src/counter.tsx")
  })
})

describe("createNodeHmr", () => {
  it("routes only its own path and serves SSE", async () => {
    const hmr = createNodeHmr({ heartbeatMs: 0 })
    try {
      expect(await hmr.fetch(new Request("http://x/not-hmr"))).toBeUndefined()
      const response = await hmr.fetch(new Request("http://x/hmr"))
      expect(response?.headers.get("content-type")).toContain("text/event-stream")
      const reader = response!.body!.getReader()
      const decoder = new TextDecoder()
      const connected = decoder.decode((await reader.read()).value)
      expect(decodeHmrMessage(dataOf(connected))).toMatchObject({ type: "connected" })
      hmr.publish("src/app.tsx")
      const update = decoder.decode((await reader.read()).value)
      expect(decodeHmrMessage(dataOf(update))).toEqual({
        type: "update",
        modules: ["src/app.tsx"],
      })
      await reader.cancel()
    } finally {
      hmr.close()
    }
  })

  it("bridges node:http via toNodeListener", async () => {
    const hmr = createNodeHmr({ heartbeatMs: 0 })
    const server = createServer(toNodeListener(hmr))
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/hmr`)
      expect(response.headers.get("content-type")).toContain("text/event-stream")
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      const connected = decoder.decode((await reader.read()).value)
      expect(decodeHmrMessage(dataOf(connected))).toMatchObject({ type: "connected" })

      hmr.publish("src/counter.tsx")
      const update = decoder.decode((await reader.read()).value)
      expect(decodeHmrMessage(dataOf(update))).toEqual({
        type: "update",
        modules: ["src/counter.tsx"],
      })
      await reader.cancel()

      const missing = await fetch(`http://127.0.0.1:${port}/other`)
      expect(missing.status).toBe(404)
    } finally {
      await closeServer(server)
      hmr.close()
    }
  })

  it("watches files through the shared watcher", async () => {
    const root = await mkdtemp(join(tmpdir(), "kiko-hmr-node-"))
    const hmr = createNodeHmr({ heartbeatMs: 0, cwd: root, watch: root, debounceMs: 5 })
    const published: string[] = []
    hmr.hub.subscribe({ send: payload => published.push(payload) })
    try {
      await writeFile(join(root, "counter.tsx"), "export const x = 1\n")
      await waitFor(() => published.length > 0, 3000)
      expect(published.map(decodeHmrMessage)).toEqual([
        { type: "update", modules: ["counter.tsx"] },
      ])
    } finally {
      hmr.close()
    }
  })
})

describe("bindHmrSocket", () => {
  it("connects an EventEmitter-style WebSocket to the hub", () => {
    const received: unknown[] = []
    const hmr = createNodeHmr({ heartbeatMs: 0, onMessage: message => received.push(message) })
    const socket = new FakeSocket()
    const unbind = hmr.bindSocket(socket)

    expect(decodeHmrMessage(socket.sent[0]!)).toMatchObject({ type: "connected" })
    hmr.publish("src/x.tsx")
    expect(decodeHmrMessage(socket.sent[1]!)).toEqual({
      type: "update",
      modules: ["src/x.tsx"],
    })

    socket.emit("message", JSON.stringify({ type: "hello" }))
    expect(received).toEqual([{ type: "hello" }])

    unbind()
    hmr.publish("src/y.tsx")
    expect(socket.sent.length).toBe(2)
    hmr.close()
  })

  it("is also exported standalone", () => {
    const socket = new FakeSocket()
    const hub = createNodeHmr({ heartbeatMs: 0 }).hub
    const unbind = bindHmrSocket(hub, socket)
    expect(socket.sent.length).toBe(1)
    unbind()
    hub.close()
  })
})
