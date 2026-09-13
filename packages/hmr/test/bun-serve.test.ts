import { describe, it, expect } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBunHmr, toModuleId } from "../src/bun/serve"
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

describe("toModuleId", () => {
  it("normalizes to forward slashes relative to cwd", () => {
    expect(toModuleId("/app", "/app/src/counter.tsx")).toBe("src/counter.tsx")
  })
})

describe("createBunHmr", () => {
  it("serves the endpoint over SSE and WebSocket", async () => {
    const received: unknown[] = []
    const hmr = createBunHmr({ heartbeatMs: 0, onMessage: message => received.push(message) })
    const server = Bun.serve({
      port: 0,
      fetch: (request, srv) => hmr.fetch(request, srv) ?? new Response("nope", { status: 404 }),
      websocket: hmr.websocket,
    })
    const origin = `http://localhost:${server.port}`

    try {
      // 非端点路径交回宿主。
      expect(hmr.fetch(new Request(`${origin}/not-hmr`))).toBeUndefined()

      const sse = await fetch(`${origin}/hmr`)
      expect(sse.headers.get("content-type")).toContain("text/event-stream")
      const reader = sse.body!.getReader()
      const decoder = new TextDecoder()
      const connected = decoder.decode((await reader.read()).value)
      expect(decodeHmrMessage(dataOf(connected))).toMatchObject({ type: "connected" })

      const socket = new WebSocket(`ws://localhost:${server.port}/hmr`)
      const messages: string[] = []
      socket.addEventListener("message", event => messages.push(String(event.data)))
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve())
        socket.addEventListener("error", () => reject(new Error("websocket error")))
      })
      await waitFor(() => messages.length >= 1)
      expect(decodeHmrMessage(messages[0]!)).toMatchObject({ type: "connected" })

      hmr.publish("src/app.tsx")
      await waitFor(() => messages.length >= 2)
      expect(decodeHmrMessage(messages[1]!)).toEqual({ type: "update", modules: ["src/app.tsx"] })

      const sseUpdate = decoder.decode((await reader.read()).value)
      expect(decodeHmrMessage(dataOf(sseUpdate))).toEqual({
        type: "update",
        modules: ["src/app.tsx"],
      })

      // 客户端消息经 WS 回到 Hub。
      socket.send(JSON.stringify({ type: "hello" }))
      await waitFor(() => received.length >= 1)
      expect(received).toEqual([{ type: "hello" }])

      await reader.cancel()
      socket.close()
    } finally {
      server.stop(true)
      hmr.close()
    }
  })

  it("rejects WebSocket upgrades when the host passes no server", async () => {
    const hmr = createBunHmr({ heartbeatMs: 0 })
    const response = await hmr.fetch(
      new Request("http://localhost/hmr", { headers: { upgrade: "websocket" } }),
    )
    expect(response?.status).toBe(426)
    hmr.close()
  })

  it("watches files and publishes debounced module ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "kiko-hmr-"))
    const hmr = createBunHmr({ heartbeatMs: 0, cwd: root, watch: root, debounceMs: 5 })
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
