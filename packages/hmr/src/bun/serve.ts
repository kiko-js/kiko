import { decodeHmrMessage, encodeHmrMessage, HMR_PROTOCOL_VERSION } from "../protocol"
import { createHmrHub, type HmrHub, type HmrHubOptions, type HmrSink } from "../server"
import { createPathWatcher, DEFAULT_HMR_INCLUDE, resolveWatchRoots } from "../watcher"

/**
 * `@kikojs/hmr/bun` 的服务端接线：把通用核心 Hub 接成 `Bun.serve` 的
 * `fetch` + `websocket` 入口（接入方式之一；通用代码见 `@kikojs/hmr`）。
 *
 * ```ts
 * import { createBunHmr } from "@kikojs/hmr/bun"
 *
 * const hmr = createBunHmr({ watch: ["./src"] })
 * Bun.serve({ fetch: hmr.fetch, websocket: hmr.websocket, routes: {...} })
 * ```
 *
 * 端点默认挂在 `/hmr`：`GET` 走 SSE（纯 Fetch API，任何能接 `fetch` 的
 * 宿主都能用），带 `Upgrade: websocket` 时走 WebSocket。`path` 可改，
 * 核心 Hub 本身不认识任何路径。
 *
 * `watch` 打开后复用通用 watcher（`../watcher`）监听源码目录，把变化文件
 * 映射成模块 id 后 `publish()`；模块 id 规范化与打包插件一致。
 */

export { toModuleId } from "../watcher"

/** `Bun.serve` 的 server 参数里我们用到的最小面（便于测试注入）。 */
export interface BunHmrUpgradeServer {
  upgrade(request: Request, options?: { data?: unknown }): boolean
}

/** Bun WebSocket 的最小面。 */
export interface BunHmrSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface BunHmrOptions extends Pick<HmrHubOptions, "heartbeatMs" | "onMessage"> {
  /** 端点路径；默认 `/hmr`。 */
  path?: string
  /** 复用已有 Hub；不传则新建。 */
  hub?: HmrHub
  /** 模块 id 规范化基准目录；默认 `process.cwd()`。 */
  cwd?: string
  /**
   * 监听文件变化并自动 `publish()`：
   * - `true` → 监听 `cwd`
   * - `string` → 监听该目录
   * - `string[]` → 监听多个目录
   * - `false` / 省略 → 不监听（由调用方自行 `publish()`）
   */
  watch?: boolean | string | string[]
  /** 参与 HMR 的文件；默认 `.ts/.tsx/.jsx`。 */
  include?: RegExp
  /** 变化合并窗口（毫秒）；默认 30。 */
  debounceMs?: number
  /** watcher 错误回调。 */
  onWatchError?(error: unknown): void
}

export interface BunHmr {
  readonly path: string
  readonly hub: HmrHub
  /** `Bun.serve({ fetch })` 入口；非本端点返回 `undefined` 交回宿主路由。 */
  fetch(request: Request, server?: BunHmrUpgradeServer): Response | Promise<Response> | undefined
  /** `Bun.serve({ websocket })` 入口。 */
  readonly websocket: {
    open(socket: BunHmrSocket): void
    message(socket: BunHmrSocket, message: string | Uint8Array): void
    close(socket: BunHmrSocket): void
  }
  /** 广播模块更新（watcher 之外也可手动调用）。 */
  publish(modules: string | string[]): void
  /** 广播整页重载。 */
  reload(reason?: string): void
  /** 停止 watcher、关闭 Hub 与所有连接。 */
  close(): void
}

export function createBunHmr(options: BunHmrOptions = {}): BunHmr {
  const path = options.path ?? "/hmr"
  const hub = options.hub ?? createHmrHub(options)
  const cwd = options.cwd ?? process.cwd()
  const sockets = new WeakMap<BunHmrSocket, () => void>()

  const sinkFor = (socket: BunHmrSocket): HmrSink => ({
    send: data => socket.send(data),
    close: () => socket.close(),
  })

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

  const fetch = (
    request: Request,
    server?: BunHmrUpgradeServer,
  ): Response | Promise<Response> | undefined => {
    const url = new URL(request.url)
    if (url.pathname !== path) return undefined

    const upgrade = request.headers.get("upgrade")
    if (upgrade?.toLowerCase() === "websocket") {
      if (!server) return new Response("WebSocket upgrade unsupported", { status: 426 })
      const upgraded = server.upgrade(request, { data: { kikoHmr: path } })
      if (upgraded) return undefined
      return new Response("WebSocket upgrade failed", { status: 400 })
    }
    return hub.handle(request)
  }

  return {
    path,
    hub,
    fetch,
    websocket: {
      open(socket) {
        sockets.set(socket, hub.subscribe(sinkFor(socket)))
        socket.send(encodeHmrMessage({ type: "connected", version: HMR_PROTOCOL_VERSION }))
      },
      message(socket, message) {
        const text =
          typeof message === "string" ? message : new TextDecoder().decode(message as Uint8Array)
        if (decodeHmrMessage(text)) hub.receive(text, sinkFor(socket))
      },
      close(socket) {
        sockets.get(socket)?.()
        sockets.delete(socket)
      },
    },
    publish(modules) {
      hub.publish(modules)
    },
    reload(reason) {
      hub.reload(reason)
    },
    close() {
      stopWatcher?.()
      stopWatcher = null
      hub.close()
    },
  }
}
