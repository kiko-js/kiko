/**
 * HMR 传输协议：服务端 ↔ 客户端之间的消息。
 *
 * 协议刻意不认识路由 / 文件路径：模块 id 是不透明字符串（可以是文件路径、
 * 虚拟模块名或任意标识），端点挂载在哪个路径也由适配器决定。三层共用同一套
 * 消息定义：
 *
 * - `./server`（`createHmrHub`）在服务端广播；
 * - `./client`（`connectHmr`）在浏览器端消费；
 * - `@kikojs/hmr/bun` 把 Bun 的 `fetch` / `websocket` 接成同一协议。
 */

export const HMR_PROTOCOL_VERSION = 1

/** 服务端 → 客户端：连接建立。 */
export interface HmrConnectedMessage {
  type: "connected"
  version: number
}

/** 服务端 → 客户端：这些模块发生变化，请应用更新。 */
export interface HmrUpdateMessage {
  type: "update"
  modules: string[]
}

/** 服务端 → 客户端：整页重载（如模块图无法安全热替换）。 */
export interface HmrReloadMessage {
  type: "reload"
  reason?: string
}

/** 服务端 → 客户端：心跳。 */
export interface HmrPingMessage {
  type: "ping"
}

/** 客户端 → 服务端：握手。 */
export interface HmrHelloMessage {
  type: "hello"
  version?: number
}

/** 客户端 → 服务端：心跳应答。 */
export interface HmrPongMessage {
  type: "pong"
}

export type HmrServerMessage =
  | HmrConnectedMessage
  | HmrUpdateMessage
  | HmrReloadMessage
  | HmrPingMessage

export type HmrClientMessage = HmrHelloMessage | HmrPongMessage

export type HmrMessage = HmrServerMessage | HmrClientMessage

const SERVER_TYPES: ReadonlySet<string> = new Set(["connected", "update", "reload", "ping"])
const CLIENT_TYPES: ReadonlySet<string> = new Set(["hello", "pong"])

export function encodeHmrMessage(message: HmrMessage): string {
  return JSON.stringify(message)
}

/** 解析一条传输消息；非法输入返回 null（调用方忽略即可）。 */
export function decodeHmrMessage(raw: string): HmrMessage | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null) return null
  const type = (value as { type?: unknown }).type
  if (typeof type !== "string") return null
  if (!SERVER_TYPES.has(type) && !CLIENT_TYPES.has(type)) return null
  return value as HmrMessage
}

export function isHmrServerMessage(message: HmrMessage): message is HmrServerMessage {
  return SERVER_TYPES.has(message.type)
}

export function isHmrClientMessage(message: HmrMessage): message is HmrClientMessage {
  return CLIENT_TYPES.has(message.type)
}
