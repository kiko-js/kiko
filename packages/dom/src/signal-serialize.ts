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
 * （水合对齐的固有要求）。`stopSignalRestore()` 会校验两端数量；恢复消费
 * 时比对类型指纹（基础类型用 typeof；对象再加类别——纯对象/数组/Map/Set/
 * Date/类实例），可报出多数跨型与对象结构漂移。检出边界：typeof 相同的
 * 基础类型（两个 number、两个 string…）错序在位置化恢复下不可区分，保持
 * 静默——这是位置契约的固有盲区，能挡的是「结构性/类型级」漂移。
 *
 * 限制：
 * - 仅捕获通过 `@kikojs/dom` 的 `createSignal` 创建的信号（组件内信号）。
 * - 恢复窗口是**同步**的（`hydrate()` 单同步栈）。`<Suspend>` 内 async
 *   组件 await 之后创建的信号在窗口关闭后才运行，不会恢复（见
 *   `docs/design/signal-restore-async.md`）。
 * - JSON 序列化：默认只做 `JSON.stringify` / `JSON.parse`（或注册 codec 的
 *   encode/decode）往返，零逐值校验、零报错——只承诺 **JSON 语义等价**的数据
 *   （有限数 / string / boolean / null / 纯对象 / 数组），其余类型由 JSON 降级
 *   （Date→string、Map/Set/类实例→纯对象、undefined/NaN→null…）。需要排查类型
 *   降级时让服务端以开发模式运行（`NODE_ENV=development`）：服务端跑无损 gate，
 *   无法完美转换的值记录错误并在 envelope `l` 字段标记；客户端恢复逻辑常驻
 *   （不读环境变量、无独立开关），无条件兑现 `l` 标记并在命中处 throw
 *   （fail-fast）。生产无 `l` 产出 → 客户端自然静默。循环 / bigint / 函数 /
 *   symbol 在 gate 下 throw；纯 JSON 路径下由原生 `JSON.stringify` throw
 *   （bigint/循环）。需要类型保真请用 `SignalStateCodec`，或 `@kikojs/signal`
 *   的 `createStore` / 自序列化。
 * - 序列化输出把 `<` 转义为 `\u003c`（JSON 语义等价）：信号值里含 `</script>`
 *   时直接嵌入 `<script>` 不会破防。
 * - 非并发安全：同进程多次渲染会共享捕获状态（与 hydrate 游标相同的约束）。
 *   重入 `startSignalCapture()` 不重置已捕获信号（避免截断本请求），新会话
 *   必须先 `stopSignalCapture()`。
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
  /** 服务端标记的「无法完美 JSON 化、已降级」的信号位置（恢复时逐位记录） */
  restoreLossy: number[]
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
  restoreLossy: [],
}

type SerializeScope = () => SerializeSlot | undefined
let scope: SerializeScope | null = null

/** 注册请求作用域读取器(由 server 侧装置调用) */
export function setSerializeStateScope(read: SerializeScope | null): void {
  scope = read
}

/**
 * 调试开关只存在于**服务端**（由 Node 自身的 `NODE_ENV` 判定），无独立 API。
 * 是否开发模式决定 `serializeSignals()` 是否运行无损 gate 校验并报错：
 * - `NODE_ENV === 'development'`：对每个快照做 JSON 无损判定，无法完美转换的
 *   值 `console.error` 记录并在 envelope `l` 字段标记（客户端据此 fail-fast）。
 * - 其余（production / 未设置 / test…）：零扫描零告警，信号状态仅经
 *   `JSON.stringify` / `JSON.parse`（或注册的 codec）往返，不产出 `l`。
 *
 * 客户端恢复路径**不读环境变量、无自己的开关**——它常驻且纯数据驱动：恢复时
 * 无条件兑现 envelope 携带的 `l` 标记（命中即 throw）。生产不报错的原因不是
 * 客户端忽略，而是生产服务端根本不产出 `l`。开发模式因此只需服务端置
 * `NODE_ENV=development`（前端构建工具/框架的 dev 模式默认即设）。
 */
function isDevMode(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV === "development"
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
    restoreLossy: [],
  }
}

function slot(): SerializeSlot {
  return scope?.() ?? fallback
}

// ---------------------------------------------------------------------------
// 信号状态编解码器（依赖注入）
// ---------------------------------------------------------------------------

/**
 * 信号状态编解码器（依赖注入）：类型化数据需要跨 SSR 边界保真时的扩展点。
 *
 * 默认（不注册 codec）只做 JSON 往返，非开发模式零校验——信号值如非 JSON
 * 语义等价会被 JSON 静默降级。开发模式（服务端 `NODE_ENV=development`）下这些
 * 降级会被无损 gate 标记并报错。需要类型保真的用户自行提供一对对称函数：
 * - `encode`（服务端）：把捕获的信号快照转成可完美往返的形式（可带类型 tag，
 *   如 `Date → { $date: iso }`），随后该值即通过无损判定，不再被标记降级；
 * - `decode`（客户端）：把 `JSON.parse` 后的值还原为类型化形式，作为
 *   `createSignal` 的初始值。
 *
 * encode/decode 必须对称，两端共享同一份实现；库对位置数组逐值应用（未处理
 * 的值应原样返回）。注册后所有入口自动生效：服务端 `serializeSignals()` /
 * `signalStateScript()`，客户端 `restoreSignals()` / `hydrateWithState()`。
 */
export interface SignalStateCodec {
  encode?: (value: unknown) => unknown
  decode?: (value: unknown) => unknown
}

let codec: SignalStateCodec | null = null

/**
 * 注册 / 清除信号状态编解码器（依赖注入）。传 `null` 恢复默认 JSON 语义等价
 * 契约。两端（服务端 encode、客户端 decode）各注册所需那一半即可。
 */
export function setSignalStateCodec(c: SignalStateCodec | null): void {
  codec = c
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
    // 重入时绝不重置:清空 in-flight 会话已捕获的信号会把本请求的序列化截断,
    // 客户端照顺序恢复时报 phantom 数量错位(比残留告警更糟)。恢复一个新会话
    // 必须先 stopSignalCapture();并发渲染必须 withSSRScope() 各自隔离。
    console.warn(
      "[kiko ssr] startSignalCapture() while a capture is already active in this scope — " +
        "ignored (already-captured signals are kept). Call stopSignalCapture() before " +
        "starting a new session, and wrap concurrent renders in withSSRScope() " +
        "(@kikojs/dom/server) so each request owns its capture state",
    )
    return
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
 * `signal.get()` 的快照。输出中的 `<` 转义为 `\u003c`（JSON 语义等价）。
 *
 * 非开发模式只做 `JSON.stringify`（或注册 codec 的 `encode`）往返，零逐值
 * 校验。**开发模式**（服务端 `NODE_ENV=development`）下才对每个快照做无损
 * gate：无法被**完美**转换为 JSON 的值（undefined / NaN / ±Infinity / Date /
 * Map / Set / 类实例 / 嵌套被丢弃的键）`console.error` 记录，并在 envelope 的
 * `l` 字段标记位置，供客户端恢复时定位/throw。循环 / bigint / 函数 / symbol 由
 * `JSON.stringify` 本身 throw（fail-fast，任何模式一致）。
 */
export function serializeSignals(): string {
  // 若注册了 codec,先把每个快照 encode 成 JSON 语义等价形式再校验/嵌入。
  const encode = codec?.encode
  const values = slot().capturedSignals.map(s => {
    const v = s.get()
    return encode ? encode(v) : v
  })
  const payload: SerializedSignalState = { v: SIGNAL_STATE_VERSION, s: values }
  if (isDevMode()) {
    const lossy: number[] = []
    for (let i = 0; i < values.length; i++) {
      if (!isLosslessJson(values[i], new Set(), `signal #${i}`)) lossy.push(i)
    }
    if (lossy.length > 0) {
      payload.l = lossy
      console.error(
        `[kiko ssr] ${lossy.length} captured signal value(s) cannot be perfectly converted to JSON ` +
          `and will hydrate degraded (positions ${lossy.map(i => `#${i} ${describeValue(values[i])}`).join(", ")}). ` +
          `Keep signal state JSON-plain (finite numbers, strings, booleans, null, plain objects, ` +
          `arrays) or register a SignalStateCodec.encode to tag typed values`,
      )
    }
  }
  return JSON.stringify(payload).replace(/</g, "\\u003c")
}

/** 序列化状态 envelope 的形状（`v` = 格式版本号；`s` = 按创建顺序的值快照；
 *  `l` = 无法完美 JSON 化的位置索引，仅在有降级值时存在） */
export interface SerializedSignalState {
  v: 1
  s: unknown[]
  l?: number[]
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
 * 值能否被**完美**转换为 JSON（宽松模式的判定，替代手写有损类型名单）：
 * JSON 能无损表达的是——有限数 / string / boolean / null / 纯对象（原型为
 * Object.prototype 或 null）/ 数组。其余（undefined、NaN/±Infinity、Date、
 * Map、Set、类实例、RegExp、boxed、typed array、以及纯对象/数组里嵌套的
 * 上述值）都会在嵌入时变形或丢失，返回 false。
 * 循环引用 / bigint / 函数 / symbol 无法表达甚至无法 stringify，直接 throw
 * （fail-fast，与既有语义一致）。
 */
function isLosslessJson(value: unknown, seen: Set<object>, label: string): boolean {
  if (value === undefined) return false
  if (value === null || typeof value === "boolean" || typeof value === "string") return true
  if (typeof value === "number") return Number.isFinite(value)
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
  let lossless = true
  if (obj instanceof Date || obj instanceof Map || obj instanceof Set) {
    lossless = false
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (!isLosslessJson(obj[i], seen, `${label}[${i}]`)) lossless = false
    }
  } else {
    const proto = Object.getPrototypeOf(obj)
    // 非纯对象(类实例/RegExp/boxed/typed array…)经 JSON 只剩 own 字段,
    // 原型/方法丢失 → 非完美往返
    if (proto !== Object.prototype && proto !== null) lossless = false
    for (const [k, v] of Object.entries(obj)) {
      if (!isLosslessJson(v, seen, `${label}.${k}`)) lossless = false
    }
  }
  seen.delete(obj)
  return lossless
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
  let lossy: number[] = []
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
    lossy = envelope.l ?? []
  } else {
    throw new Error(
      '[kiko hydrate] unrecognized signal state payload — expected {"v":1,"s":[...]} envelope ' +
        "or a bare value array",
    )
  }
  // 若注册了 codec,把每个解析值 decode 成类型化形式作为 createSignal 初始值。
  // decode 必须与序列化时的 encode 对称(对未处理的普通值原样返回)。
  const decode = codec?.decode
  if (decode && values.length > 0) {
    values = values.map(v => decode(v))
  }
  s.restoreValues = values
  // 客户端常驻且纯数据驱动：无条件兑现 envelope 携带的降级位置标记。生产
  // 不报错是因为生产服务端从不产出 `l`；开发模式下服务端产出 `l`，此处
  // 照单消费并在 nextRestoreValue 命中时 throw（fail-fast）。
  s.restoreLossy = lossy
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
    const consumed = s.restoreIndex + s.restoreDeficit
    console.error(
      `[kiko hydrate] signal state mismatch: server serialized ${s.restoreValues.length} signals, ` +
        `client created ${consumed} — server and client must render the same component tree in ` +
        `the same order` +
        (s.restoreValues.length > consumed
          ? `; if signals are created inside an async component under <Suspend> (after an ` +
            `await), hydration's synchronous restore window closes before they run and they are ` +
            `not restored — see docs/design/signal-restore-async.md`
          : ""),
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
  s.restoreLossy = []
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
  const i = s.restoreIndex++
  if (s.restoreLossy.includes(i)) {
    // 命中服务端标记的降级位置:客户端常驻逻辑直接 throw(fail-fast)。
    // 生产无 l 标记,此处不命中;开发模式才由服务端产出 l。
    throw new Error(
      `[kiko hydrate] signal #${i} could not be perfectly serialized to JSON on the server and ` +
        `hydrates in degraded form — keep signal state JSON-plain or register a SignalStateCodec`,
    )
  }
  return s.restoreValues[i]
}

/**
 * 对象值在恢复时的粗粒度类别。只区分会实际影响「恢复后可用性」的差异(纯对象 /
 * 数组 / Map / Set / Date / 类实例),不做按 key 的精确比对:客户端 createSignal
 * 的默认值常比服务端运行时值少字段,比对 key 会把这个「恢复的本意」误报成漂移。
 * 服务端快照经 JSON 后只有 plain / array(其余已降级),客户端初始可为任意类别——
 * 类别不同即方法/结构被顶替,值得报出。
 */
function restoreShape(value: object): string {
  if (Array.isArray(value)) return "array"
  if (value instanceof Date) return "date"
  if (value instanceof Map) return "map"
  if (value instanceof Set) return "set"
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null ? "plain" : "class"
}

function recordRestoreTypeMismatch(restored: unknown, initial: unknown): void {
  const s = slot()
  s.restoreTypeMismatchCount++
  s.restoreTypeMismatchSample ??= `#${s.restoreIndex - 1}: serialized ${describeValue(restored)}, client initial ${describeValue(initial)}`
}

/**
 * 内部：由 `signal.ts` 的 `createSignal` 在消费到恢复值时调用。
 * 比对服务端快照与客户端初始值的类型指纹，等量错序的静默换值在此显形
 * （汇总到槽位，`stopSignalRestore()` 统一上报）。null/undefined 跳过——
 * undefined→null 的有损路径已由序列化侧 warn，避免双报。
 *
 * 检出边界：typeof 相同的基础类型(number/string/boolean/bigint)互换在位置化
 * 恢复下不可区分，保持静默；对象在 typeof 之外再按 `restoreShape` 类别比对，
 * 能报出「服务端纯对象顶替客户端类实例(Map/Date/Set/自定义类)」这类方法/结构
 * 丢失。纯对象之间不比对 key(默认值常少于运行值),因此同型纯对象互换仍是
 * 位置契约的固有盲区。
 */
export function noteRestoreType(restored: unknown, initial: unknown): void {
  if (restored == null || initial == null) return
  if (typeof restored !== typeof initial) {
    recordRestoreTypeMismatch(restored, initial)
    return
  }
  if (typeof restored === "object" && restoreShape(restored) !== restoreShape(initial)) {
    recordRestoreTypeMismatch(restored, initial)
  }
}

/** 是否正在捕获（测试用） */
export function isCapturing(): boolean {
  return slot().capturing
}

/** 是否正在恢复（测试用） */
export function isRestoring(): boolean {
  return slot().restoring
}
