import type { IncomingMessage, ServerResponse } from "node:http"
import { encodeHmrMessage, HMR_PROTOCOL_VERSION } from "../protocol"
import { createHmrHub, type HmrHub, type HmrHubOptions, type HmrSink } from "../server"
import { createPathWatcher, DEFAULT_HMR_INCLUDE, resolveWatchRoots } from "../watcher"

/**
 * `@kikojs/hmr/node` — kiko 的 Node 接入入口。通用代码（协议 / Hub /
 * 客户端 / 改写 / watcher）在 `@kikojs/hmr`，本入口只做 Node 原语接线：
 *
 * - `fetch`：标准 `Request → Response`（SSE），可直接给 Node 18+ 的
 *   `fetch` 风格框架，或用 `toNodeListener` 接到 `node:http`；
 * - `toNodeListener`：`node:http` 适配器，把 `IncomingMessage` 桥成
 *   `Request` 并把响应体流式写回（SSE 实时推送）；
 * - `bindSocket`：把 `ws` 等 EventEmitter 风格 WebSocket 接进 Hub。
 *
 * 注意：Node 没有内置 bundler，也不提供 `import.meta.hot`，因此改写后的
 * 模块由端点驱动（`acceptHmrModule` 里 `managed: false`）按模块 URL
 * 重新导入；模块如何被转换 / 提供由宿主自己的 dev 流程决定。
 */

export { toModuleId } from "../watcher"

/** EventEmitter 风格 WebSocket 的最小面（`ws` 的 WebSocket 满足）。 */
export interface NodeSocketLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off?(event: string, listener: (...args: unknown[]) => void): unknown
}

export interface NodeHmrOptions extends Pick<HmrHubOptions, "heartbeatMs" | "onMessage"> {
  /** 端点路径；默认 `/hmr`。 */
  path?: string
  /** 复用已有 Hub；不传则新建。 */
  hub?: HmrHub
  /** 模块 id 规范化基准目录；默认 `process.cwd()`。 */
  cwd?: string
  /** 监听文件变化并自动 `publish()`：`true` / 目录 / 目录数组；省略则不监听。 */
  watch?: boolean | string | string[]
  /** 参与 HMR 的文件；默认 `.ts/.tsx/.jsx`。 */
  include?: RegExp
  /** 变化合并窗口（毫秒）；默认 30。 */
  debounceMs?: number
  /** watcher 错误回调。 */
  onWatchError?(error: unknown): void
}

export interface NodeHmr {
  readonly path: string
  readonly hub: HmrHub
  /** 非本端点返回 `undefined`，可交给上层框架继续处理。 */
  fetch(request: Request): Response | Promise<Response> | undefined
  /** 把 EventEmitter 风格 WebSocket 接进 Hub，返回解绑函数。 */
  bindSocket(socket: NodeSocketLike): () => void
  /** 广播模块更新（watcher 之外也可手动调用）。 */
  publish(modules: string | string[]): void
  /** 广播整页重载。 */
  reload(reason?: string): void
  /** 停止 watcher、关闭 Hub 与所有连接。 */
  close(): void
}

export interface NodeListenerOptions {
  /** 未命中端点时的兜底处理（如静态资源 / 上层框架的 next）。 */
  fallback?(request: IncomingMessage, response: ServerResponse): void
}

export function createNodeHmr(options: NodeHmrOptions = {}): NodeHmr {
  const path = options.path ?? "/hmr"
  const hub = options.hub ?? createHmrHub(options)
  const cwd = options.cwd ?? process.cwd()

  let stopWatcher: (() => void) | null = null
  if (options.watch) {
    stopWatcher = createPathWatcher({
      roots: resolveWatchRoots(options.watch, cwd),
      cwd,
      include: options.include ?? DEFAULT_HMR_INCLUDE,
      debounceMs: options.debounceMs ?? 30,
      onChange: modules => hub.publish(modules),
      onError: options.onWatchError,
    })
  }

  const fetch = (request: Request): Response | Promise<Response> | undefined => {
    if (new URL(request.url).pathname !== path) return undefined
    return hub.handle(request)
  }

  return {
    path,
    hub,
    fetch,
    bindSocket: socket => bindHmrSocket(hub, socket),
    publish: modules => hub.publish(modules),
    reload: reason => hub.reload(reason),
    close() {
      stopWatcher?.()
      stopWatcher = null
      hub.close()
    },
  }
}

/** 把一个 EventEmitter 风格 WebSocket 接进 Hub（发送 `connected` 并转发更新）。 */
export function bindHmrSocket(hub: HmrHub, socket: NodeSocketLike): () => void {
  const sink: HmrSink = { send: data => socket.send(data), close: () => socket.close() }
  const unsubscribe = hub.subscribe(sink)
  socket.send(encodeHmrMessage({ type: "connected", version: HMR_PROTOCOL_VERSION }))

  const onMessage = (...args: unknown[]): void => {
    const text = decodeSocketPayload(args[0])
    if (text) hub.receive(text, sink)
  }
  const onClose = (): void => unsubscribe()

  socket.on("message", onMessage)
  socket.on("close", onClose)
  socket.on("error", onClose)

  return () => {
    unsubscribe()
    socket.off?.("message", onMessage)
    socket.off?.("close", onClose)
    socket.off?.("error", onClose)
  }
}

/** `node:http` 监听器：把请求桥成 fetch，把响应体流式写回（SSE 实时）。 */
export function toNodeListener(
  hmr: NodeHmr,
  options: NodeListenerOptions = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleNodeRequest(hmr, request, response, options).catch(error => {
      if (!response.headersSent) {
        response.statusCode = 500
        response.setHeader("content-type", "text/plain; charset=utf-8")
      }
      response.end(error instanceof Error ? error.message : String(error))
    })
  }
}

/**
 * 尝试用 HMR 端点处理一个 `node:http` 请求；返回是否命中。命中后负责
 * 写完响应，未命中时按 `options.fallback` 兜底（无兜底则 404）。
 */
export async function handleNodeRequest(
  hmr: NodeHmr,
  request: IncomingMessage,
  response: ServerResponse,
  options: NodeListenerOptions = {},
): Promise<boolean> {
  const method = (request.method ?? "GET").toUpperCase()
  const host = request.headers.host ?? "localhost"
  const url = new URL(request.url ?? "/", `http://${host}`)
  if (url.pathname !== hmr.path) {
    miss(options, request, response)
    return false
  }

  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const item of value) headers.append(key, item)
    else headers.set(key, value)
  }

  let body: Uint8Array<ArrayBuffer> | undefined
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Uint8Array<ArrayBuffer>[] = []
    for await (const chunk of request) {
      chunks.push(
        typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk),
      )
    }
    body = concatBytes(chunks)
  }

  const fetchResponse = await hmr.fetch(new Request(url, { method, headers, body }))
  if (!fetchResponse) {
    miss(options, request, response)
    return false
  }

  response.statusCode = fetchResponse.status
  fetchResponse.headers.forEach((value, key) => response.setHeader(key, value))
  response.flushHeaders?.()
  if (!fetchResponse.body) {
    response.end()
    return true
  }

  const reader = fetchResponse.body.getReader()
  const abort = (): void => {
    void reader.cancel().catch(() => {})
  }
  request.on("close", abort)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) response.write(value)
    }
  } finally {
    request.off?.("close", abort)
  }
  response.end()
  return true
}

function miss(
  options: NodeListenerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (options.fallback) {
    options.fallback(request, response)
    return
  }
  response.statusCode = 404
  response.end("Not Found")
}

function decodeSocketPayload(data: unknown): string {
  if (typeof data === "string") return data
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data))
  return ""
}

function concatBytes(chunks: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const first = chunks[0]
  if (chunks.length === 0) return new Uint8Array(0)
  if (chunks.length === 1 && first) return first
  let total = 0
  for (const chunk of chunks) total += chunk.byteLength
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}
