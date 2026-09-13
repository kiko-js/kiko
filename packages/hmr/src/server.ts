import {
  decodeHmrMessage,
  encodeHmrMessage,
  HMR_PROTOCOL_VERSION,
  isHmrClientMessage,
  type HmrClientMessage,
  type HmrServerMessage,
} from "./protocol"

/**
 * HMR Hub —— 服务端连接池与广播中心，框架无关。
 *
 * 核心约定：
 *
 * - **不认识路径**：`handle(request)` 处理“交给它的任意请求”，不解析
 *   `request.url` 的路由部分；端点挂到 `/hmr` 还是别的路径由宿主适配器决定
 *   （见 `@kikojs/hmr/bun` 的 `createBunHmr({ path })`）。
 * - **不认识传输**：只认 `HmrSink`（`send` / 可选 `close`）。SSE 由
 *   `handle()` 内建；WebSocket 等其它长连接通过 `subscribe()` / `connect()`
 *   接入，宿主只需把 socket 包成 sink。
 * - **不认识框架**：只依赖 Fetch API（`Request` / `Response` / `ReadableStream`），
 *   Bun / Deno / Cloudflare Workers / Node 18+ 都能直接用。
 *
 * 更新事件由 `publish()` / `reload()` 主动推入；谁检测文件变化（watcher、
 * bundler 回调、自定义构建流程）与 Hub 无关。
 */

/** 一个已连接客户端：Hub 只会往它写数据。 */
export interface HmrSink {
  send(data: string): void
  close?(): void
}

export interface HmrHubOptions {
  /** 心跳间隔（毫秒）；0 关闭心跳。默认 15000。 */
  heartbeatMs?: number
  /** 收到客户端消息时回调（如 hello / pong）。 */
  onMessage?(message: HmrClientMessage, sink: HmrSink | null): void
}

export interface HmrHub {
  /** 当前连接数。 */
  readonly size: number
  /** 接入一个长连接；返回退订函数。 */
  subscribe(sink: HmrSink): () => void
  /** 广播模块更新。 */
  publish(modules: string | string[]): void
  /** 广播整页重载。 */
  reload(reason?: string): void
  /** 处理一条来自客户端的原始消息（WebSocket 等非 SSE 传输用）。 */
  receive(data: string, sink?: HmrSink | null): void
  /** Fetch API 入口：`GET` → SSE 流；`POST` → 接收客户端消息。路径无关。 */
  handle(request: Request): Promise<Response>
  /** 关闭所有连接并停止心跳。 */
  close(): void
}

const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  // 反向代理（nginx 等）默认缓冲响应；显式关闭才能实时推送。
  "x-accel-buffering": "no",
}

const METHODS = "GET, POST, OPTIONS"

export function createHmrHub(options: HmrHubOptions = {}): HmrHub {
  const sinks = new Set<HmrSink>()
  const heartbeatMs = options.heartbeatMs ?? 15000
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stopHeartbeat = (): void => {
    if (!heartbeat) return
    clearInterval(heartbeat)
    heartbeat = null
  }

  const broadcast = (message: HmrServerMessage): void => {
    const payload = encodeHmrMessage(message)
    for (const sink of [...sinks]) {
      try {
        sink.send(payload)
      } catch {
        // 连接已断开：静默移除，避免一个坏 sink 影响其它客户端。
        sinks.delete(sink)
      }
    }
  }

  const subscribe = (sink: HmrSink): (() => void) => {
    if (closed) return () => {}
    sinks.add(sink)
    if (!heartbeat && heartbeatMs > 0) {
      heartbeat = setInterval(() => broadcast({ type: "ping" }), heartbeatMs)
      // Node 下别让心跳把进程吊住。
      ;(heartbeat as { unref?: () => void }).unref?.()
    }
    return () => {
      sinks.delete(sink)
      if (sinks.size === 0) stopHeartbeat()
    }
  }

  const publish = (modules: string | string[]): void => {
    const list = (Array.isArray(modules) ? modules : [modules]).filter(m => m.length > 0)
    if (list.length === 0) return
    broadcast({ type: "update", modules: list })
  }

  const reload = (reason?: string): void => {
    broadcast(reason ? { type: "reload", reason } : { type: "reload" })
  }

  const receive = (data: string, sink: HmrSink | null = null): void => {
    const message = decodeHmrMessage(data)
    if (!message || !isHmrClientMessage(message)) return
    options.onMessage?.(message, sink)
  }

  const sseResponse = (): Response => {
    const encoder = new TextEncoder()
    let unsubscribe: (() => void) | null = null
    let closedStream = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sink: HmrSink = {
          send(payload) {
            if (closedStream) return
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
          },
          close() {
            if (closedStream) return
            closedStream = true
            try {
              controller.close()
            } catch {
              // 已经关闭
            }
          },
        }
        unsubscribe = subscribe(sink)
        sink.send(encodeHmrMessage({ type: "connected", version: HMR_PROTOCOL_VERSION }))
      },
      cancel() {
        closedStream = true
        unsubscribe?.()
        unsubscribe = null
      },
    })
    return new Response(stream, { headers: SSE_HEADERS })
  }

  const handle = async (request: Request): Promise<Response> => {
    const method = request.method.toUpperCase()
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { allow: METHODS } })
    }
    if (method === "POST") {
      const body = await request.text()
      const message = decodeHmrMessage(body)
      if (!message || !isHmrClientMessage(message)) {
        return new Response("Bad Request", { status: 400 })
      }
      options.onMessage?.(message, null)
      return new Response(null, { status: 204 })
    }
    if (method === "GET") return sseResponse()
    return new Response("Method Not Allowed", { status: 405, headers: { allow: METHODS } })
  }

  const close = (): void => {
    closed = true
    stopHeartbeat()
    for (const sink of [...sinks]) {
      try {
        sink.close?.()
      } catch {
        // 忽略
      }
    }
    sinks.clear()
  }

  return {
    get size() {
      return sinks.size
    },
    subscribe,
    publish,
    reload,
    receive,
    handle,
    close,
  }
}
