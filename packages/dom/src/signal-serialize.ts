/**
 * 信号序列化：服务端渲染时捕获信号状态，嵌入 HTML；客户端水合前恢复，
 * 使客户端信号初始值与服务端快照一致，消除「客户端初始值 == SSR 快照」假设。
 *
 * - 服务端：`startSignalCapture()` → `renderToFragment()` → `serializeSignals()`
 *   在 createSignal 调用顺序中给每个信号分配递增 ID，渲染完后序列化为
 *   `{"v":1,"s":[value0, value1, ...]}` envelope（`v` = 格式版本号），嵌入
 *   `<script type="application/json">`（`signalStateScript()` 一步生成）。
 * - 客户端：`restoreSignals(json)` → `hydrate()` 在组件求值期把
 *   createSignal 的初始值替换为序列化值（按同一顺序消费）。
 *
 * 前提：服务端与客户端的组件树结构相同，createSignal 调用顺序一致
 * （水合对齐的固有要求）。`stopSignalRestore()` 会校验两端数量，恢复消费
 * 时还会比对类型指纹（服务端快照 typeof vs 客户端初始值 typeof）：数量
 * 一致但顺序漂移的错位也能报出（而非静默换值）。
 *
 * 限制：
 * - 仅捕获通过 `@kikojs/dom` 的 `createSignal` 创建的信号（组件内信号）。
 * - JSON 序列化：循环引用 / bigint / 函数 / symbol 直接 throw（带信号序号与
 *   值描述），undefined / NaN / Date / Map / Set 有损（→null / →string / →{}）
 *   时 warn。复杂状态请用 `@kikojs/signal` 的 `createStore` 或自序列化。
 * - 序列化输出把 `<` 转义为 `\u003c`（JSON 语义等价）：信号值里含 `</script>`
 *   时直接嵌入 `<script>` 不会破防。
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
  /** 恢复类型指纹诊断：服务端快照与客户端初始值类型不符的位置数与首例描述 */
  restoreTypeMismatchCount: number
  restoreTypeMismatchSample: string | null
}

let fallback: SerializeSlot = {
  capturing: false,
  capturedSignals: [],
  restoring: false,
  restoreIndex: 0,
  restoreValues: [],
  restoreDeficit: 0,
  restoreTypeMismatchCount: 0,
  restoreTypeMismatchSample: null,
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
    restoreTypeMismatchCount: 0,
    restoreTypeMismatchSample: null,
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
  if (s.capturing) {
    console.warn(
      "[kiko ssr] startSignalCapture() called while another capture is still active — " +
        "either a session was never stopped with stopSignalCapture(), or concurrent " +
        "renders are not wrapped in withSSRScope() (@kikojs/dom/server); captured " +
        "signal data may leak across requests",
    )
  }
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
 * 序列化已捕获信号当前值（服务端，渲染后调用）。
 * 输出 `{"v":1,"s":[...]}` envelope，数组下标 = 信号创建顺序 ID，值 =
 * `signal.get()` 的快照。序列化前校验每个快照：不可 JSON 化（循环 / bigint /
 * 函数 / symbol）直接 throw（带信号序号与值描述，fail-fast 优于静默腐坏）；
 * 有损类型（undefined / NaN / Date / Map / Set）聚合 warn。输出中的 `<`
 * 转义为 `\u003c`（JSON 语义等价），信号值含 `</script>` 时嵌入脚本不破防。
 */
export function serializeSignals(): string {
  const values = slot().capturedSignals.map(s => s.get())
  const lossy: string[] = []
  for (let i = 0; i < values.length; i++) {
    checkJsonValue(values[i], `signal #${i}`, new Set(), lossy)
  }
  if (lossy.length > 0) {
    console.warn(
      `[kiko ssr] signal state contains lossy values (hydration restores the lossy form): ` +
        lossy.join("; "),
    )
  }
  return JSON.stringify({ v: SIGNAL_STATE_VERSION, s: values }).replace(/</g, "\\u003c")
}

/** 序列化状态 envelope 的形状（`v` = 格式版本号，`s` = 按创建顺序的值快照） */
export interface SerializedSignalState {
  v: 1
  s: unknown[]
}

const SIGNAL_STATE_VERSION = 1

/** 值的可读描述（诊断信息用） */
function describeValue(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  const type = typeof value
  if (type === "object" || type === "function") {
    const name = (value as object).constructor?.name
    return name && name !== "Object" ? `${name} instance` : type
  }
  return type
}

/**
 * 递归校验一个值可否 JSON 序列化：不可序列化直接 throw；有损类型记入
 * `lossy`（恢复时这些值会静默变质，必须在服务端渲染期报出来）。
 */
function checkJsonValue(value: unknown, label: string, seen: Set<object>, lossy: string[]): void {
  if (value === undefined) {
    lossy.push(`${label} undefined→null`)
    return
  }
  if (value === null || typeof value === "boolean") return
  if (typeof value === "number") {
    if (!Number.isFinite(value)) lossy.push(`${label} ${String(value)}→null`)
    return
  }
  if (typeof value === "string") return
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error(
      `[kiko ssr] ${label} holds a non-serializable value (${describeValue(value)}) — ` +
        `hydration would silently corrupt this signal's state; keep captured signal state JSON-safe`,
    )
  }
  const obj = value as object
  if (seen.has(obj)) {
    throw new Error(
      `[kiko ssr] ${label} contains a cyclic reference — it cannot be serialized as JSON; ` +
        `keep captured signal state JSON-safe`,
    )
  }
  seen.add(obj)
  if (obj instanceof Date) {
    lossy.push(`${label} Date→string`)
  } else if (obj instanceof Map || obj instanceof Set) {
    lossy.push(`${label} ${obj.constructor.name}→{}`)
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) checkJsonValue(obj[i], `${label}[${i}]`, seen, lossy)
  } else {
    for (const [k, v] of Object.entries(obj)) checkJsonValue(v, `${label}.${k}`, seen, lossy)
  }
  seen.delete(obj)
}

/** 把序列化状态包成可直接嵌入页面的水合状态脚本块（配合 `hydrateWithState()`）。 */
export function signalStateScript(): string {
  return `<script id="kiko-state" type="application/json">${serializeSignals()}</script>`
}

/**
 * 准备恢复信号（客户端，水合前调用）。
 * 接受 `signalStateScript()` / `serializeSignals()` 产出的 envelope JSON
 * （或已解析的 envelope 对象）；也接受旧格式的裸值数组。后续 `createSignal`
 * 将按顺序消费这些值作为初始值，并做类型指纹诊断。
 */
export function restoreSignals(state: string | unknown[] | SerializedSignalState): void {
  const s = slot()
  if (s.restoring) {
    console.warn(
      "[kiko hydrate] restoreSignals() called while another restore is still active — " +
        "the previous session was never stopped with stopSignalRestore()",
    )
  }
  let parsed: unknown = state
  if (typeof state === "string") {
    try {
      parsed = JSON.parse(state)
    } catch (e) {
      throw new Error(
        `[kiko hydrate] embedded signal state is not valid JSON (${(e as Error).message})`,
        { cause: e },
      )
    }
  }
  let values: unknown[]
  if (Array.isArray(parsed)) {
    values = parsed
  } else if (typeof parsed === "object" && parsed !== null && "v" in parsed && "s" in parsed) {
    const envelope = parsed as SerializedSignalState
    if (envelope.v !== SIGNAL_STATE_VERSION) {
      throw new Error(
        `[kiko hydrate] unsupported signal state format version ${JSON.stringify(envelope.v)} ` +
          `(expected ${SIGNAL_STATE_VERSION}) — server and client packages are out of sync`,
      )
    }
    if (!Array.isArray(envelope.s)) {
      throw new Error('[kiko hydrate] malformed signal state envelope: "s" must be an array')
    }
    values = envelope.s
  } else {
    throw new Error(
      '[kiko hydrate] unrecognized signal state payload — expected {"v":1,"s":[...]} envelope ' +
        "or a bare value array",
    )
  }
  s.restoreValues = values
  s.restoreIndex = 0
  s.restoreTypeMismatchCount = 0
  s.restoreTypeMismatchSample = null
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
  if (s.restoreTypeMismatchCount > 0) {
    console.error(
      `[kiko hydrate] signal state type mismatch at ${s.restoreTypeMismatchCount} position(s) ` +
        `(${s.restoreTypeMismatchSample}) — server and client may create signals in a different ` +
        `order; keep createSignal calls symmetric between server and client`,
    )
  }
  s.restoring = false
  s.restoreValues = []
  s.restoreIndex = 0
  s.restoreDeficit = 0
  s.restoreTypeMismatchCount = 0
  s.restoreTypeMismatchSample = null
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

/**
 * 内部：由 `signal.ts` 的 `createSignal` 在消费到恢复值时调用。
 * 比对服务端快照与客户端初始值的类型指纹，等量错序的静默换值在此显形
 * （汇总到槽位，`stopSignalRestore()` 统一上报）。null/undefined 跳过——
 * undefined→null 的有损路径已由序列化侧 warn，避免双报。
 */
export function noteRestoreType(restored: unknown, initial: unknown): void {
  if (restored == null || initial == null || typeof restored === typeof initial) return
  const s = slot()
  s.restoreTypeMismatchCount++
  s.restoreTypeMismatchSample ??= `#${s.restoreIndex - 1}: serialized ${describeValue(restored)}, client initial ${describeValue(initial)}`
}

/** 是否正在捕获（测试用） */
export function isCapturing(): boolean {
  return slot().capturing
}

/** 是否正在恢复（测试用） */
export function isRestoring(): boolean {
  return slot().restoring
}
