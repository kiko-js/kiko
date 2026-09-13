import { describe, it, expect } from "bun:test"
import { createHmrHub, type HmrSink } from "../src/server"
import { decodeHmrMessage, HMR_PROTOCOL_VERSION } from "../src/protocol"

/** 收集 sink 收到的原始负载（Hub 只负责编码，不加 SSE 帧）。 */
function collector(): { sink: HmrSink; messages: string[] } {
  const messages: string[] = []
  return { sink: { send: data => messages.push(data) }, messages }
}

describe("createHmrHub", () => {
  it("broadcasts module updates to every subscriber", () => {
    const hub = createHmrHub({ heartbeatMs: 0 })
    const a = collector()
    const b = collector()
    hub.subscribe(a.sink)
    hub.subscribe(b.sink)

    hub.publish("src/app.tsx")
    hub.publish(["src/a.tsx", "src/b.tsx"])

    expect(a.messages.map(decodeHmrMessage)).toEqual([
      { type: "update", modules: ["src/app.tsx"] },
      { type: "update", modules: ["src/a.tsx", "src/b.tsx"] },
    ])
    expect(b.messages.length).toBe(2)
    hub.close()
  })

  it("ignores empty publishes and supports unsubscribe", () => {
    const hub = createHmrHub({ heartbeatMs: 0 })
    expect(hub.size).toBe(0)
    const { sink, messages } = collector()
    const unsubscribe = hub.subscribe(sink)
    expect(hub.size).toBe(1)

    hub.publish([])
    expect(messages).toEqual([])

    unsubscribe()
    expect(hub.size).toBe(0)
    hub.publish("x.ts")
    expect(messages).toEqual([])
    hub.close()
  })

  it("reloads and receives client messages without touching paths", () => {
    const hub = createHmrHub({ heartbeatMs: 0 })
    const { sink, messages } = collector()
    hub.subscribe(sink)

    hub.reload("graph changed")
    expect(decodeHmrMessage(messages[0]!)).toEqual({ type: "reload", reason: "graph changed" })

    let seen: unknown = null
    const hub2 = createHmrHub({ heartbeatMs: 0, onMessage: message => (seen = message) })
    hub2.receive(JSON.stringify({ type: "hello", version: 1 }))
    hub2.receive("not json")
    expect(seen).toEqual({ type: "hello", version: 1 })
    hub.close()
    hub2.close()
  })

  it("serves SSE for any request the host routes to it", async () => {
    const hub = createHmrHub({ heartbeatMs: 0 })
    // 任意路径、任意 host：Hub 不解析 URL，只认 Request。
    const response = await hub.handle(new Request("http://example.test/some/where"))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const first = decoder.decode((await reader.read()).value)
    expect(first).toContain("data: ")
    expect(decodeHmrMessage(extractData(first))).toEqual({
      type: "connected",
      version: HMR_PROTOCOL_VERSION,
    })

    hub.publish("src/counter.tsx")
    const second = decoder.decode((await reader.read()).value)
    expect(decodeHmrMessage(extractData(second))).toEqual({
      type: "update",
      modules: ["src/counter.tsx"],
    })

    await reader.cancel()
    hub.close()
  })

  it("accepts POSTed client messages and rejects malformed bodies", async () => {
    const received: unknown[] = []
    const hub = createHmrHub({ heartbeatMs: 0, onMessage: message => received.push(message) })

    const ok = await hub.handle(
      new Request("http://example.test/hmr", { method: "POST", body: '{"type":"pong"}' }),
    )
    expect(ok.status).toBe(204)
    const bad = await hub.handle(
      new Request("http://example.test/hmr", { method: "POST", body: "nope" }),
    )
    expect(bad.status).toBe(400)
    expect(received).toEqual([{ type: "pong" }])

    const notAllowed = await hub.handle(
      new Request("http://example.test/hmr", { method: "DELETE" }),
    )
    expect(notAllowed.status).toBe(405)
    hub.close()
  })
})

function extractData(frame: string): string {
  const line = frame.split("\n").find(l => l.startsWith("data: "))
  return line ? line.slice("data: ".length) : ""
}
