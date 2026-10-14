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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  it("disables Bun's per-request idle timeout for the SSE stream only", async () => {
    const hmr = createBunHmr({ heartbeatMs: 0 })
    const timeouts: number[] = []
    const server = {
      upgrade: () => false,
      timeout: (_request: Request, seconds: number) => {
        timeouts.push(seconds)
      },
    }
    try {
      const sse = await hmr.fetch(new Request("http://localhost/hmr"), server)
      expect(sse?.headers.get("content-type")).toContain("text/event-stream")
      expect(timeouts).toEqual([0])
      await sse?.body?.cancel()

      // 升级 / 非 GET 都不是长连接，不该动宿主的超时设置。
      await hmr.fetch(
        new Request("http://localhost/hmr", { headers: { upgrade: "websocket" } }),
        server,
      )
      await hmr.fetch(
        new Request("http://localhost/hmr", {
          method: "POST",
          body: JSON.stringify({ type: "hello" }),
        }),
        server,
      )
      expect(timeouts).toEqual([0])

      // 没有 server（或老版本 Bun 没这个方法）时端点照常工作。
      const sseWithoutTimeout = await hmr.fetch(new Request("http://localhost/hmr"), {
        upgrade: () => false,
      })
      expect(sseWithoutTimeout?.status).toBe(200)
      await sseWithoutTimeout?.body?.cancel()
    } finally {
      hmr.close()
    }
  })

  // 回归：Bun.serve 默认空闲 10s 就会断开连接，切在 chunked 流中间 → 浏览器报
  // net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)。这里把空闲窗口压到 1s，用
  // 「只传 request」的对照组证明切断真实存在，而透传 server 的连接必须活下来。
  it("keeps the SSE stream alive past Bun's idle timeout", async () => {
    const fixed = createBunHmr({ heartbeatMs: 0 })
    const control = createBunHmr({ heartbeatMs: 0 })
    const servers = [
      Bun.serve({
        port: 0,
        idleTimeout: 1,
        fetch: (request, server) =>
          fixed.fetch(request, server) ?? new Response(null, { status: 404 }),
        websocket: fixed.websocket,
      }),
      Bun.serve({
        port: 0,
        idleTimeout: 1,
        fetch: request => control.fetch(request) ?? new Response(null, { status: 404 }),
        websocket: control.websocket,
      }),
    ]
    try {
      const fixedReader = (
        await fetch(`http://localhost:${servers[0]!.port}/hmr`)
      ).body!.getReader()
      const controlReader = (
        await fetch(`http://localhost:${servers[1]!.port}/hmr`)
      ).body!.getReader()
      await fixedReader.read()
      await controlReader.read()

      // 对照组：宿主没把 server 交给 hmr.fetch，空闲超时照旧，read 以结束或报错收场。
      const killed = await Promise.race([
        controlReader.read().then(
          () => true,
          () => true,
        ),
        delay(15000).then(() => false),
      ])
      expect(killed).toBe(true)

      // 修好的那条连接在对照组被切断之后仍然能收到广播。
      fixed.hub.publish("src/app.tsx")
      const frame = new TextDecoder().decode((await fixedReader.read()).value)
      expect(decodeHmrMessage(dataOf(frame))).toEqual({
        type: "update",
        modules: ["src/app.tsx"],
      })
      await fixedReader.cancel()
    } finally {
      for (const server of servers) server.stop(true)
      fixed.close()
      control.close()
    }
  }, 20000)

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
