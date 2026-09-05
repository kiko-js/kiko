/**
 * 信号序列化：服务端渲染时捕获信号状态，嵌入 HTML；客户端水合前恢复，
 * 使客户端信号初始值与服务端快照一致，消除「客户端初始值 == SSR 快照」假设。
 *
 * 工作机制：
 * - 服务端：`startSignalCapture()` → `renderToFragment()` → `serializeSignals()`
 *   在 createSignal 调用顺序中给每个信号分配递增 ID，渲染完后把
 *   `[value0, value1, ...]` 序列化为 JSON，嵌入 `<script type="application/json">`。
 * - 客户端：`restoreSignals(json)` → `hydrate()` 在组件求值期把
 *   createSignal 的初始值替换为序列化值（按同一顺序消费）。
 *
 * 前提：服务端与客户端的组件树结构相同，createSignal 调用顺序一致
 * （水合对齐的固有要求）。`stopSignalRestore()` 会校验两端数量：不一致时
 * `console.error` 报出两端信号数,使排序契约的破坏可检测(而非静默错位)。
 *
 * 限制：
 * - 仅捕获通过 `@kikojs/dom` 的 `createSignal` 创建的信号（组件内信号）。
 * - JSON 序列化：不支持 undefined（→null）、Date（→字符串）、Map/Set（→{}）、
 *   循环引用、函数。复杂状态请用 `@kikojs/signal` 的 `createStore` 或自序列化。
 * - 非并发安全：同进程多次渲染会共享捕获状态（与 hydrate 游标相同的约束）。
 */

import { Signal } from "signal-polyfill"

/**
 * 序列化状态槽:模块级兜底;服务端请求作用域(@kikojs/dom/server 的
 * AsyncLocalStorage 装置)按请求注入,并发渲染的捕获互不污染。
 * 客户端恢复路径从不装作用域,恒走兜底槽。
 * @internal 槽位结构仅供 server 侧装置消费
 */
export interface SerializeSlot {
  capturing: boolean
  capturedSignals: Signal.State<unknown>[]
  restoring: boolean
  restoreIndex: number
  restoreValues: unknown[]
  restoreDeficit: number
}

let fallback: SerializeSlot = {
  capturing: false,
  capturedSignals: [],
  restoring: false,
  restoreIndex: 0,
  restoreValues: [],
  restoreDeficit: 0,
}

type SerializeScope = () => SerializeSlot | undefined
let scope: SerializeScope | null = null

/** 注册请求作用域读取器(由 server 侧装置调用) */
export function setSerializeStateScope(read: SerializeScope | null): void {
  scope = read
}

/** @internal 供 server 侧装置创建每请求状态 */
export function freshSerializeState(): SerializeSlot {
  return {
    capturing: false,
    capturedSignals: [],
    restoring: false,
    restoreIndex: 0,
    restoreValues: [],
    restoreDeficit: 0,
  }
}

function slot(): SerializeSlot {
  return scope?.() ?? fallback
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 开始捕获信号（服务端，渲染前调用）。
 * 重置捕获状态，后续 `createSignal` 调用会被记录。
 */
export function startSignalCapture(): void {
  const s = slot()
  s.capturing = true
  s.capturedSignals.length = 0
}

/**
 * 停止捕获（服务端，渲染后调用）。
 */
export function stopSignalCapture(): void {
  slot().capturing = false
}

/**
 * 序列化已捕获信号当前值为 JSON 字符串（服务端，渲染后调用）。
 * 数组下标 = 信号创建顺序 ID，值 = `signal.get()` 的快照。
 */
export function serializeSignals(): string {
  return JSON.stringify(slot().capturedSignals.map(s => s.get()))
}

/**
 * 准备恢复信号（客户端，水合前调用）。
 * 解析序列化 JSON，后续 `createSignal` 将按顺序消费这些值作为初始值。
 */
export function restoreSignals(json: string | unknown[]): void {
  const s = slot()
  s.restoreValues = Array.isArray(json) ? json : JSON.parse(json)
  s.restoreIndex = 0
  s.restoring = true
}

/**
 * 停止恢复（客户端，水合后调用）。
 */
export function stopSignalRestore(): void {
  const s = slot()
  if (s.restoring && (s.restoreIndex < s.restoreValues.length || s.restoreDeficit > 0)) {
    console.error(
      `[kiko hydrate] signal state mismatch: server serialized ${s.restoreValues.length} signals, client created ${s.restoreIndex + s.restoreDeficit} — server and client must render the same component tree in the same order`,
    )
  }
  s.restoring = false
  s.restoreValues = []
  s.restoreIndex = 0
  s.restoreDeficit = 0
}

/**
 * 内部：由 `signal.ts` 的 `createSignal` 调用。
 * - 捕获模式：记录信号。
 */
export function trackSignal<T>(sig: Signal.State<T>): void {
  const s = slot()
  if (s.capturing) s.capturedSignals.push(sig as Signal.State<unknown>)
}

/** 恢复模式下的下一个初始值；无更多值时返回 undefined。 */
export function nextRestoreValue(): unknown | undefined {
  const s = slot()
  if (!s.restoring) return undefined
  if (s.restoreIndex >= s.restoreValues.length) {
    s.restoreDeficit++
    return undefined
  }
  return s.restoreValues[s.restoreIndex++]
}

/** 是否正在捕获（测试用） */
export function isCapturing(): boolean {
  return slot().capturing
}

/** 是否正在恢复（测试用） */
export function isRestoring(): boolean {
  return slot().restoring
}
