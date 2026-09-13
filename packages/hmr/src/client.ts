import { getHmrRegistry, type KikoHmrRegistry } from "./contract"
import {
  decodeHmrMessage,
  encodeHmrMessage,
  isHmrServerMessage,
  type HmrClientMessage,
  type HmrReloadMessage,
  type HmrServerMessage,
} from "./protocol"

/**
 * HMR 客户端（`@kikojs/hmr/client`）—— 浏览器 / 任意 fetch 环境侧的连接层。
 *
 * - 传输可切换：`sse`（默认，纯 Fetch API / EventSource，跨代理最稳）或
 *   `ws`；`auto` 先试 WebSocket，失败回落 SSE。
 * - 默认连到 `/hmr`（可用 `url` 覆盖）；端点路径只是客户端的默认值，
 *   服务端 Hub 本身不认识路径。
 * - `ensureHmrClient()` 是全局单例（`Symbol.for("kiko:hmr:client")`），
 *   与注册表一样跨包副本共享。它把服务端 `update` / `reload` 消息落到
 *   唯一的 HMR 注册表：模块有 bundler HMR（`import.meta.hot`）时交给
 *   bundler 替换；否则按 `import.meta.url` 重新导入模块并触发 remount。
 */

export type HmrTransport = "sse" | "ws" | "auto"
export type HmrClientStatus = "idle" | "connecting" | "connected" | "disconnected"

/** EventSource 的最小可用面（便于测试注入与跨运行时适配）。 */
export interface HmrEventSourceLike {
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  close(): void
}

/** WebSocket 的最小可用面。 */
export interface HmrWebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: unknown) => void,
  ): void
}

export interface HmrClientOptions {
  /** 端点地址；默认相对 `location` 解析 `/hmr`。 */
  url?: string
  /** 传输方式；默认 `sse`。 */
  transport?: HmrTransport
  /** 断线自动重连；默认 true。 */
  reconnect?: boolean
  /** 重连退避下限（毫秒）；默认 500。 */
  minReconnectDelayMs?: number
  /** 重连退避上限（毫秒）；默认 5000。 */
  maxReconnectDelayMs?: number
  /** 注入 EventSource 构造（测试 / 非浏览器运行时）。 */
  createEventSource?(url: string): HmrEventSourceLike
  /** 注入 WebSocket 构造（测试 / 非浏览器运行时）。 */
  createWebSocket?(url: string): HmrWebSocketLike
  /** 收到任意服务端消息（在 `on()` 订阅之前调用）。 */
  onMessage?(message: HmrServerMessage): void
  /** 连接状态变化。 */
  onStatus?(status: HmrClientStatus, transport: "sse" | "ws" | null): void
}

export interface HmrClient {
  readonly transport: "sse" | "ws" | null
  readonly status: HmrClientStatus
  on<T extends HmrServerMessage["type"]>(
    type: T,
    handler: (message: Extract<HmrServerMessage, { type: T }>) => void,
  ): () => void
  send(message: HmrClientMessage): void
  close(): void
}

/** 默认端点：同源 `/hmr`；非浏览器环境（无 `location`）退化为字面量。 */
export function resolveHmrEndpoint(url?: string): string {
  if (url) return url
  const location = (globalThis as { location?: { href?: string } }).location
  if (location?.href) return new URL("/hmr", location.href).href
  return "/hmr"
}

function toWebSocketUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url
  if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`
  const location = (globalThis as { location?: { href?: string } }).location
  if (location?.href) return toWebSocketUrl(new URL(url, location.href).href)
  return url
}

function defaultEventSource(url: string): HmrEventSourceLike {
  const Ctor = (globalThis as { EventSource?: new (url: string) => HmrEventSourceLike }).EventSource
  if (!Ctor) throw new Error("[kiko hmr] EventSource unavailable — pass createEventSource()")
  return new Ctor(url)
}

function defaultWebSocket(url: string): HmrWebSocketLike {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => HmrWebSocketLike }).WebSocket
  if (!Ctor) throw new Error("[kiko hmr] WebSocket unavailable — pass createWebSocket()")
  return new Ctor(url)
}

function decodeSocketData(data: unknown): string {
  if (typeof data === "string") return data
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data))
  return ""
}

export function connectHmr(options: HmrClientOptions = {}): HmrClient {
  const url = resolveHmrEndpoint(options.url)
  const requested = options.transport ?? "sse"
  const reconnect = options.reconnect ?? true
  const minDelay = options.minReconnectDelayMs ?? 500
  const maxDelay = options.maxReconnectDelayMs ?? 5000

  const listeners = new Map<string, Set<(message: HmrServerMessage) => void>>()
  let active: "sse" | "ws" | null = null
  let status: HmrClientStatus = "idle"
  let source: HmrEventSourceLike | null = null
  let socket: HmrWebSocketLike | null = null
  let attempts = 0
  let closed = false
  let fellBack = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const emitStatus = (): void => options.onStatus?.(status, active)

  const setStatus = (next: HmrClientStatus): void => {
    status = next
    emitStatus()
  }

  const dispatch = (raw: unknown): void => {
    const message = decodeHmrMessage(decodeSocketData(raw))
    if (!message || !isHmrServerMessage(message)) return
    options.onMessage?.(message)
    for (const handler of listeners.get(message.type) ?? []) handler(message)
  }

  const scheduleReconnect = (): void => {
    if (closed || !reconnect || timer) return
    const delay = Math.min(maxDelay, minDelay * 2 ** attempts)
    attempts++
    timer = setTimeout(() => {
      timer = null
      open()
    }, delay)
  }

  const teardown = (): void => {
    if (source) {
      source.onopen = null
      source.onmessage = null
      source.onerror = null
      source.close()
      source = null
    }
    if (socket) {
      // 先摘引用再 close：close 监听器看到 socket !== current 会直接返回，
      // 避免在「WS 失败 → 回落 SSE」时又排一次 WS 重连。
      const dying = socket
      socket = null
      try {
        dying.close()
      } catch {
        // 已关闭
      }
    }
  }

  const fallbackToSse = (): void => {
    if (closed || fellBack) return
    fellBack = true
    teardown()
    openSse()
  }

  const openSse = (): void => {
    if (closed) return
    const create = options.createEventSource ?? defaultEventSource
    try {
      source = create(url)
    } catch {
      setStatus("disconnected")
      scheduleReconnect()
      return
    }
    active = "sse"
    setStatus("connecting")
    source.onopen = () => {
      attempts = 0
      setStatus("connected")
    }
    source.onmessage = event => dispatch(event.data)
    source.onerror = () => {
      // EventSource 自带重连，这里统一接管，保持状态与退避可控。
      teardown()
      setStatus("disconnected")
      scheduleReconnect()
    }
  }

  const openWs = (): void => {
    if (closed) return
    const create = options.createWebSocket ?? defaultWebSocket
    let opened = false
    try {
      socket = create(toWebSocketUrl(url))
    } catch {
      fallbackToSse()
      return
    }
    active = "ws"
    setStatus("connecting")
    const current = socket
    current.addEventListener("open", () => {
      opened = true
      attempts = 0
      setStatus("connected")
    })
    current.addEventListener("message", event => {
      dispatch((event as { data?: unknown }).data)
    })
    current.addEventListener("close", () => {
      if (socket !== current) return
      socket = null
      setStatus("disconnected")
      // `auto` 下 WS 一波未开就失败 → 回落 SSE；否则按退避重连。
      if (!opened && requested === "auto" && !fellBack) fallbackToSse()
      else scheduleReconnect()
    })
    current.addEventListener("error", () => {
      if (socket !== current || opened) return
      // 错误后通常紧跟 close；若没有，主动收尾。
      if (requested === "auto" && !fellBack) fallbackToSse()
    })
  }

  const open = (): void => {
    if (closed) return
    const transport = requested === "auto" ? (hasWebSocket() ? "ws" : "sse") : requested
    if (transport === "ws") openWs()
    else openSse()
  }

  const send = (message: HmrClientMessage): void => {
    const payload = encodeHmrMessage(message)
    if (socket && active === "ws") {
      try {
        socket.send(payload)
      } catch {
        // 连接已断，忽略
      }
      return
    }
    // SSE 是单向通道：客户端消息走 POST。
    const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch
    void fetchFn?.(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    }).catch(() => {})
  }

  open()

  return {
    get transport() {
      return active
    },
    get status() {
      return status
    },
    on(type, handler) {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(handler as (message: HmrServerMessage) => void)
      return () => {
        set?.delete(handler as (message: HmrServerMessage) => void)
      }
    },
    send,
    close() {
      closed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      teardown()
      setStatus("disconnected")
    },
  }
}

function hasWebSocket(): boolean {
  return typeof (globalThis as { WebSocket?: unknown }).WebSocket === "function"
}

/* ------------------------------------------------------------------ *
 * 注册表应用层：把端点消息落到唯一的 HMR 注册表。
 * ------------------------------------------------------------------ */

export interface HmrModuleOptions {
  /** 模块自身 URL（通常注入 `import.meta.url`），非 bundler HMR 时用于重新导入。 */
  url?: string
  /** bundler 已提供 `import.meta.hot`：模块替换交给它，端点只负责通知。 */
  managed?: boolean
}

export interface HmrApplyOptions extends HmrClientOptions {
  /** 目标注册表；默认取全局注册表（`getHmrRegistry()`）。 */
  registry?: KikoHmrRegistry | null
  /** `reload` 消息处理；默认整页刷新。 */
  onReload?(message: HmrReloadMessage): void
  /** 重新导入模块；默认动态 `import()`（带缓存击穿查询）。 */
  loadModule?(url: string): Promise<unknown>
  /** 重新导入失败回调。 */
  onError?(error: unknown, moduleId: string): void
}

export interface HmrAppliedClient {
  readonly client: HmrClient
  readonly registry: KikoHmrRegistry | null
  /** 注册一个模块：端点通知到达时按策略应用。 */
  register(moduleId: string, options?: HmrModuleOptions): void
  close(): void
}

const CLIENT_SYMBOL: unique symbol = Symbol.for("kiko:hmr:client")

function bustUrl(url: string, stamp: number): string {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}kiko-hmr=${stamp}`
}

function createAppliedClient(options: HmrApplyOptions): HmrAppliedClient {
  const registry = options.registry !== undefined ? options.registry : (getHmrRegistry() ?? null)
  const modules = new Map<string, HmrModuleOptions>()
  const load =
    options.loadModule ?? ((url: string): Promise<unknown> => import(/* @vite-ignore */ url))
  let counter = 0

  const applyModule = async (moduleId: string): Promise<void> => {
    const entry = modules.get(moduleId)
    if (!entry || !registry) return
    // bundler HMR 自己会重跑 accept 回调（`moduleUpdated(id, m)`）；端点不再插手，
    // 避免同一次保存触发两次 remount。
    if (entry.managed) return
    if (!entry.url) {
      registry.moduleUpdated(moduleId, null)
      return
    }
    try {
      const mod = await load(bustUrl(entry.url, ++counter))
      registry.moduleUpdated(moduleId, mod)
    } catch (error) {
      options.onError?.(error, moduleId)
    }
  }

  const client = connectHmr({
    ...options,
    onMessage(message) {
      options.onMessage?.(message)
      if (message.type === "update") {
        for (const moduleId of message.modules) void applyModule(moduleId)
      } else if (message.type === "reload") {
        if (options.onReload) options.onReload(message)
        else (globalThis as { location?: { reload?: () => void } }).location?.reload?.()
      }
    },
  })

  return {
    client,
    registry,
    register(moduleId, moduleOptions) {
      modules.set(moduleId, moduleOptions ?? {})
    },
    close() {
      client.close()
      modules.clear()
    },
  }
}

/**
 * 宿主可在模块脚本之前设置 `globalThis.__KIKO_HMR__` 来配置端点 / 传输：
 *
 * ```html
 * <script>
 *   globalThis.__KIKO_HMR__ = { url: "/hmr", transport: "ws" }
 * </script>
 * ```
 */
function hostDefaults(): HmrApplyOptions {
  // eslint-disable-next-line no-underscore-dangle -- 约定的宿主全局配置名
  return (globalThis as { __KIKO_HMR__?: HmrApplyOptions }).__KIKO_HMR__ ?? {}
}

/**
 * 获取（或首次创建）全局唯一的应用层客户端。显式 `options` 覆盖宿主全局
 * 配置；首个调用生效，后续调用返回同一实例——与注册表单例一致，双包共享。
 */
export function ensureHmrClient(options: HmrApplyOptions = {}): HmrAppliedClient {
  const global = globalThis as Record<symbol, unknown>
  const existing = global[CLIENT_SYMBOL] as HmrAppliedClient | undefined
  if (existing) return existing
  const applied = createAppliedClient({ ...hostDefaults(), ...options })
  global[CLIENT_SYMBOL] = applied
  return applied
}

/** 插件注入入口：登记模块（组件模块与模块级信号模块都会调用）。 */
export function acceptHmrModule(moduleId: string, options?: HmrModuleOptions): HmrAppliedClient {
  const applied = ensureHmrClient()
  applied.register(moduleId, options)
  return applied
}

/** 测试 / 重新接线用：丢弃全局单例（不关闭连接）。 */
export function resetHmrClient(): void {
  delete (globalThis as Record<symbol, unknown>)[CLIENT_SYMBOL]
}
