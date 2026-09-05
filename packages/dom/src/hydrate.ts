import { Signal } from "signal-polyfill"
import { KikoLazy, isLazy, realizeLazy } from "./lazy-node"
import { createWatcher, isSignal, reportError, watchSignal } from "./signal"
import type { WatchableSignal } from "./signal"
import { isRestoring, restoreSignals, stopSignalRestore } from "./signal-serialize"
import type { SerializedSignalState } from "./signal-serialize"
import {
  attachDelegationRoot,
  cleanupWatchers,
  detachDelegationRoot,
  setRef,
  jsx,
  setProp,
  Style,
  swapNodes,
  toNodes,
  trackCleanup,
  trackWatcher,
} from "./jsx-runtime"
import { isPromiseLike, isTruthy, unwrap, settleChildren } from "./shared"
import { createForCore } from "./for-engine"
import { createBranchManager } from "./branch-engine"
import { SUSPEND_END_MARKER } from "./markers"
import type { AsyncComponent, Component, Props, StyleProps } from "./jsx-runtime"

/**
 * 客户端水合：采纳 SSR 产出的现有 DOM，而不是重建。
 *
 * kiko 的 JSX 是急切求值（children 先于父组件），无法用线性游标按文档序对齐，
 * 因此采用「惰性 PendingNode」：水合模式下 `jsx` 返回一个待采纳节点，父级在
 * 处理 children 时按当前游标逐节点采纳——采纳顺序 == 求值顺序 == 文档序
 * （兄弟节点左右序一致）。信号 / Show / For / Suspend 按 SSR 输出的注释标记
 * （`<!---->`、`<!--show-->` 等）对齐，采纳现有内容后照常挂 watcher。
 *
 * 水合模式只在 `hydrate()` 同步执行期间开启；Suspend 的迟到内容（lazy 模块）
 * 在客户端模式构建后整体换入。
 */

let hydrateDepth = 0

export function isHydrating(): boolean {
  return hydrateDepth > 0
}

function beginHydrate(): void {
  hydrateDepth++
}

function endHydrate(): void {
  hydrateDepth--
}

// 当前游标：采纳中的节点列表与位置。
// 单实例约束：游标是模块级状态,一次 hydrate() 一个根(beginHydrate/endHydrate
// 保护嵌套)。水合必须在单个同步栈内完成——并行水合多个根(Islands)会互相
// 消费游标。需要并发时,每次 hydrate() 调用整体串行化,或等待文档级拆分。
let cursor: Node[] = []
let cursorPos = 0

function take(): Node | undefined {
  return cursor[cursorPos++]
}

// 采纳中的元素 tag 栈(外层在前):warn 用于定位出错位置
const adoptPath: string[] = []
// strict 模式:水合错位从 warn 升级为 throw(测试/CI 用)
let strictMode = false

function warn(message: string): void {
  const where = adoptPath.length > 0 ? ` inside <${adoptPath.join("><")}>` : ""
  const at = cursor.length > 0 ? `, at node ${cursorPos}/${cursor.length}` : ""
  if (strictMode) throw new Error(`[kiko hydrate] ${message}${where}${at}`)
  console.error(`[kiko hydrate] ${message}${where}${at}`)
}

/**
 * 待采纳节点：element 类型取游标 1 个节点后调用 resolve(el)；
 * group 类型（Fragment / 控制流）不取节点，resolve() 自行按标记采纳。
 * `rebuild` 在客户端模式（水合结束后）重建真实节点——控制流组件（如
 * Show）的 children/fallback 是水合期急切求值的 PendingNode，信号驱动
 * 切换分支时无法用游标采纳，必须重建。
 */
class PendingNode {
  constructor(
    readonly kind: "element" | "group",
    readonly resolve: (el?: Node) => Node[],
    readonly rebuild?: () => Node,
  ) {}
}

/**
 * 水合根级清理：在 hydrate() 返回的 disposer 里统一执行（早于
 * cleanupWatchers）。供无法预知自身 DOM 锚点的组件使用——例如 Router 的
 * 内容会被 Outlet 的分支交换移出初始位置，挂在子树节点上的 cleanup 会
 * 随交换丢失；水合模式下这类组件把清理挂到水合根上。
 * 非水合期调用则立即执行（防御性：调用方在水合分支外误用时保持语义）。
 */
const rootCleanups: Array<() => void> = []

export function onHydrateCleanup(fn: () => void): void {
  if (hydrateDepth > 0) {
    rootCleanups.push(fn)
  } else {
    fn()
  }
}

/**
 * 组级 PendingNode：resolve 返回的节点直接交给父级游标处理，不消耗游标。
 * 供控制类组件（Router / Navigate）在水合期惰性解析用。
 */
export function hydratePendingGroup(resolve: () => Node[]): Node {
  return new PendingNode("group", resolve) as unknown as Node
}

/**
 * 元素级 PendingNode + 采纳后钩子：先按标准协议采纳（重放 props、游标
 * 对齐子节点），再执行 `post`——挂 effect、trackCleanup 等需要真实节点
 * 的工作。rebuild 走标准重建路径（水合结束后的分支切换）。
 */
export function hydratePendingElement(tag: string, props: Props, post?: (el: Node) => void): Node {
  return new PendingNode(
    "element",
    el => {
      hydrateElement(el!, tag, props)
      post?.(el!)
      return [el!]
    },
    () => jsx(tag, props),
  ) as unknown as Node
}
/**
 * 采纳一个值对应的现有节点（按 SSR 标记与结构逐一对齐）。除了 hydrate()
 * 内部，`./hydrate` 子路径把它提供给需要自定义采纳流程的包（如
 * @kikojs/router 的 Outlet：在 PendingNode resolve 里采纳路由组件输出）。
 */
export function hydrateValue(value: unknown): Node[] {
  if (isLazy(value)) return hydrateValue(realizeLazy(value))
  if (value == null || value === false || value === true) return []
  if (isSignal(value)) return hydrateSignalChild(value as WatchableSignal<unknown>)
  if (value instanceof PendingNode) {
    if (value.kind === "element") {
      const el = take()
      if (!el) {
        warn("expected element, ran out of nodes")
        return []
      }
      return value.resolve(el)
    }
    return value.resolve()
  }
  if (isPromiseLike(value)) {
    throw new Error("Promise rendered outside <Suspend> — wrap async components in <Suspend>")
  }
  if (typeof value === "string" || typeof value === "number") {
    const expected = String(value)
    // SSR 对空字符串不产出文本节点（信号路径是 `<!---->` 后没有内容），
    // 直接返回 []，不消费游标——否则会误取相邻兄弟节点并误报。
    if (expected === "") return []
    const node = take()
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      warn("expected text node")
      return []
    }
    const text = node as Text
    const content = text.textContent ?? ""
    if (content !== expected) {
      if (content.startsWith(expected)) {
        // HTML 解析器合并相邻文本节点：SSR 输出的信号快照（<!---->0）可能已与
        // 紧随其后的文本（"，doubled = "）合并成一个节点。按期望值前缀拆分，
        // 多余部分归还游标，保持"一个值 = 一个节点"的水合对齐协议。
        const rest = text.splitText(expected.length)
        cursor.splice(cursorPos, 0, rest)
      } else {
        // 失配：服务端快照与客户端初始值不一致。以客户端值为准回填（客户端
        // 是后续唯一的事实来源），并明确告警，避免静默保留过期内容。
        warn(`text mismatch: expected "${expected}", found "${content}"`)
        text.textContent = expected
      }
    }
    return [text]
  }
  if (Array.isArray(value)) {
    const out: Node[] = []
    for (const item of value) out.push(...hydrateValue(item))
    return out
  }
  if (value instanceof Node) {
    // 客户端构建的真实节点：SSR 无法序列化，按对应数量的现有节点对齐
    const node = take()
    if (!node) {
      warn("expected node, ran out of nodes")
      return []
    }
    return [node]
  }
  warn(`unsupported value in children: ${String(value)}`)
  return []
}

/** 元素：采纳 el，重放 props（挂监听 / 信号 / 属性），递归采纳子节点 */
function hydrateElement(el: Node, tag: string, props: Props): void {
  if (el.nodeType !== Node.ELEMENT_NODE || (el as Element).tagName.toLowerCase() !== tag) {
    warn(`tag mismatch: expected <${tag}>, found ${(el as Element).tagName ?? el.nodeName}`)
  }
  for (const key of Object.keys(props)) {
    if (key === "children") continue
    setProp(el as Parameters<typeof setProp>[0], key, props[key])
  }
  const savedCursor = cursor
  const savedPos = cursorPos
  cursor = Array.from(el.childNodes)
  cursorPos = 0
  adoptPath.push(tag)
  try {
    hydrateValue(props.children)
    if (cursorPos < cursor.length) {
      warn(`unmatched children remain in <${tag}> (${cursor.length - cursorPos})`)
    }
  } finally {
    adoptPath.pop()
    cursor = savedCursor
    cursorPos = savedPos
  }
}
export function hydrateJsx(
  tag: string | Component<any> | AsyncComponent<any>,
  props: Props | null,
): unknown {
  const p = props ?? ({} as Props)

  if (typeof tag === "function") {
    // 组件：透传其返回值（PendingNode / 数组 / 文本），由父级游标对齐
    // 惰性原型：组件体推迟到游标采纳该 children 时执行，保持
    // 采纳顺序 == 求值顺序 == 文档序；ref 剥离后在元素采纳完成时触发
    const ref = p.ref
    if (ref == null) return new KikoLazy(() => tag(p)) as unknown as unknown
    const rest = { ...p } as Props
    delete rest.ref
    return new KikoLazy(() => adoptComponentRef(tag(rest), ref)) as unknown as unknown
  }

  if (tag === "style") {
    // <style>：采纳现有元素（SSR 已输出；不做 constructable sheet 优化）
    return new PendingNode(
      "element",
      el => [el!],
      () => Style(p as StyleProps),
    )
  }

  return new PendingNode(
    "element",
    el => {
      hydrateElement(el!, tag, p)
      return [el!]
    },
    () => jsx(tag, p),
  )
}

export function hydrateFragment(children: unknown): PendingNode {
  return new PendingNode("group", () => hydrateValue(children))
}

export function hydrateStyle(props: StyleProps): PendingNode {
  return new PendingNode(
    "element",
    el => [el!],
    // 水合后分支切换（如 Show 重建）走客户端 Style:没有 rebuild 时
    // PendingNode 会被 toNodes 兜底转成 "[object Object]" 文本
    () => Style(props),
  )
}

/**
 * 组件根的 ref 在水合期的触发点：元素级 PendingNode 采纳（hydrateElement
 * 重放 props）完成后以真实元素触发；组级/非节点输出无法确定唯一元素，
 * 原型下告警跳过。
 */
export function adoptComponentRef(node: unknown, ref: unknown): unknown {
  if (node instanceof PendingNode && node.kind === "element") {
    return new PendingNode(
      "element",
      el => {
        const out = node.resolve(el)
        if (el instanceof Node && el.nodeType === Node.ELEMENT_NODE)
          setRef(el as Parameters<typeof setRef>[0], ref)
        return out
      },
      node.rebuild,
    )
  }
  if (node != null) {
    warn("ref on a component that does not return a single element is ignored")
  }
  return node
}

/** 信号子节点：采纳 `<!---->` 标记 + 快照内容，挂 watcher */
function hydrateSignalChild(signal: WatchableSignal<unknown>): Node[] {
  const marker = take()
  if (!marker || marker.nodeType !== Node.COMMENT_NODE) {
    warn("expected signal marker comment")
    return []
  }
  let current = hydrateValue(signal.get())
  const render = (): void => {
    current = swapNodes(marker, current, toNodes(signal.get()))
  }
  const watcher = watchSignal(signal, render)
  trackWatcher(marker, watcher)
  trackCleanup(marker, () => {
    for (const n of current) cleanupWatchers(n)
    current = []
  })
  return [marker, ...current]
}

/**
 * 分支值物化:惰性组件先 realize(水合模式下组件体产出 PendingNode),再走
 * rebuild(客户端模式重建,不消费游标);其余值走 toNodes。Show/Suspend/
 * ErrorBoundary 的分支切换共用。
 */
function toBranchNodes(value: unknown): Node[] {
  if (isLazy(value)) return toBranchNodes(realizeLazy(value))
  if (value instanceof PendingNode && value.rebuild) return toNodes(value.rebuild())
  return toNodes(value)
}

export function hydrateShow(props: {
  when: unknown
  fallback?: unknown
  children: unknown | ((value: unknown) => unknown)
}): PendingNode {
  return new PendingNode("group", () => {
    const marker = take()
    if (!marker || marker.nodeType !== Node.COMMENT_NODE) {
      warn("expected show marker")
      return []
    }
    const branch = (): unknown => {
      const cond = unwrap(props.when)
      if (isTruthy(cond)) {
        return typeof props.children === "function"
          ? (props.children as (value: unknown) => unknown)(cond)
          : props.children
      }
      return props.fallback
    }
    // 切换分支时无法用游标采纳（水合已结束）：PendingNode 走 rebuild 重建，
    // 其余值走 toNodes。初次采纳仍用 hydrateValue 对齐 SSR 现有节点。
    // 静态（非函数）分支值按值身份缓存同一批节点:换出保留 watcher,换回复用
    // (与客户端 Show 的 truthyNodes/fallbackNodes 缓存语义一致;PendingNode
    // 首次 rebuild 后同样入缓存,内部绑定跨切换存活)
    const retainable = (value: unknown): boolean => typeof value !== "function"
    const staticCache = new Map<unknown, Node[]>()
    const toRetainedNodes = (value: unknown): Node[] => {
      const cached = staticCache.get(value)
      if (cached) return cached
      const nodes = toBranchNodes(value)
      if (retainable(value)) staticCache.set(value, nodes)
      return nodes
    }
    const branches = createBranchManager(marker)
    // 初次采纳的节点若来自静态分支,同样进缓存并保留——首个 toggle 不得
    // 清理它们(否则换回时是另一批节点)
    const initial = branch()
    branches.adopt(hydrateValue(initial))
    let currentRetained = retainable(initial)
    if (currentRetained) staticCache.set(initial, branches.current)
    let lastValue: unknown
    let hasLast = false
    const render = (): void => {
      const value = branch()
      // 同值且命中缓存分支时跳过换入(同批缓存节点的重插是纯浪费);
      // 函数值(非 retainable)契约是每次 when 变化重跑,不短路
      if (hasLast && retainable(value) && Object.is(value, lastValue)) return
      hasLast = true
      lastValue = value
      branches.swap(toRetainedNodes(value), currentRetained)
      currentRetained = retainable(value)
    }
    if (isSignal(props.when)) {
      const signal = props.when as WatchableSignal<unknown>
      const watcher = watchSignal(signal, render)
      trackWatcher(marker, watcher)
    }
    trackCleanup(marker, () => branches.cleanup())
    return [marker, ...branches.current]
  })
}
export function hydrateFor(props: {
  each: unknown
  getKey?: (item: unknown, index: number) => unknown
  children: (item: unknown, index: () => number) => unknown
}): PendingNode {
  return new PendingNode("group", () => {
    const marker = take()
    if (!marker || marker.nodeType !== Node.COMMENT_NODE) {
      warn("expected for marker")
      return []
    }
    const getKey = props.getKey
    // 更新路径与 flow.ts 完全共用同一引擎(ForCore);水合特有的是初次采纳:
    // 逐游标消费现有节点,不能整表重建——通过 render 钩子注入 hydrateValue,
    // 条目模型与 keyed/identity 更新逻辑全部复用引擎实现。
    const core = createForCore({ marker, children: props.children, render: hydrateValue })

    const adopt = (): void => {
      const list = unwrap(props.each) as readonly unknown[]
      if (getKey) core.adoptKeyed(list, getKey)
      else core.adoptIdentity(list)
    }

    const render = (): void => {
      const list = unwrap(props.each) as readonly unknown[]
      if (getKey) core.keyed(list, getKey)
      else core.identity(list)
    }

    adopt()
    if (isSignal(props.each)) {
      const signal = props.each as WatchableSignal<readonly unknown[]>
      const watcher = watchSignal(signal, render)
      trackWatcher(marker, watcher)
    }
    trackCleanup(marker, () => core.dispose())
    return [marker, ...core.current]
  })
}

export function hydrateErrorBoundary(props: {
  fallback?: unknown | ((error: unknown) => unknown)
  onError?: (error: unknown) => void
  resetSignal?: Signal.State<unknown>
  errorSignal?: Signal.State<unknown>
  children: () => unknown
}): PendingNode {
  return new PendingNode("group", () => {
    const marker = take()
    if (!marker || marker.nodeType !== Node.COMMENT_NODE) {
      warn("expected error-boundary marker")
      return []
    }
    const branches = createBranchManager(marker)
    let fallbackNodes: Node[] | null = null
    let currentIsFallback = false
    // 与客户端 ErrorBoundary 相同的驱动信号：children 在 computed 内求值，
    // 信号变化 / reset 都能重渲染——修复水合后完全失去响应性的问题。
    const reset = props.resetSignal ?? new Signal.State<unknown>(undefined)
    const error = props.errorSignal ?? new Signal.State<unknown>(null)
    const childrenComputed = new Signal.Computed<unknown>(() => {
      reset.get()
      return props.children()
    })

    const renderFallback = (err: unknown): Node[] => {
      const fb =
        typeof props.fallback === "function"
          ? (props.fallback as (error: unknown) => unknown)(err)
          : props.fallback
      // 函数 fallback 每次按错误重建;静态 fallback 缓存复用。PendingNode
      // 走 rebuild,不消费水合游标
      if (typeof props.fallback === "function") return toBranchNodes(fb)
      if (!fallbackNodes) fallbackNodes = toBranchNodes(fb)
      return fallbackNodes
    }

    // 初次水合：通过 childrenComputed 采纳（依赖在水合期就建立，
    // 信号变化才能驱动后续重渲染）；抛错采纳 fallback
    try {
      const nodes = hydrateValue(childrenComputed.get())
      branches.adopt(nodes)
      currentIsFallback = false
    } catch (e) {
      error.set(e)
      try {
        props.onError?.(e)
      } catch {
        // onError 是用户代码，不能破坏错误边界
      }
      const fb =
        typeof props.fallback === "function"
          ? (props.fallback as (error: unknown) => unknown)(e)
          : props.fallback
      const nodes = hydrateValue(fb)
      branches.adopt(nodes)
      if (typeof props.fallback !== "function") {
        fallbackNodes = nodes
        currentIsFallback = true
      } else {
        currentIsFallback = false
      }
    }

    const render = (): void => {
      if (error.get() !== null) {
        branches.swap(renderFallback(error.get()), currentIsFallback)
        currentIsFallback = typeof props.fallback !== "function"
        return
      }
      try {
        branches.swap(toNodes(childrenComputed.get()), currentIsFallback)
        currentIsFallback = false
      } catch (e) {
        error.set(e)
        try {
          props.onError?.(e)
        } catch {
          // onError 是用户代码，不能破坏错误边界
        }
        branches.swap(renderFallback(e), currentIsFallback)
        currentIsFallback = typeof props.fallback !== "function"
      }
    }

    const watcher = createWatcher(() => {
      queueMicrotask(() => {
        try {
          if (error.get() === null) render()
        } catch (err) {
          reportError(err)
        } finally {
          watcher.watch(childrenComputed)
        }
      })
    })
    watcher.watch(childrenComputed)
    trackWatcher(marker, watcher)

    const resetWatcher = createWatcher(() => {
      queueMicrotask(() => {
        try {
          if (error.get() === null) return
          reset.get()
          error.set(null)
          render()
          watcher.watch(childrenComputed)
        } catch (err) {
          reportError(err)
        } finally {
          resetWatcher.watch(reset)
        }
      })
    })
    resetWatcher.watch(reset)
    trackWatcher(marker, resetWatcher)

    trackCleanup(marker, () => {
      branches.cleanup()
      fallbackNodes = null
    })
    return [marker, ...branches.current]
  })
}

/** 把 Suspend 的解析值对齐到 SSR 采纳的节点：水合期构建的 PendingNode 逐节点
 *  对齐（挂上绑定），客户端构建的真实节点直接使用 */
function hydrateResolvedContent(value: unknown, adopted: Node[]): Node[] {
  const align = (v: unknown): Node[] => {
    if (v instanceof PendingNode) {
      const savedCursor = cursor
      const savedPos = cursorPos
      cursor = adopted
      cursorPos = 0
      let nodes: Node[]
      if (v.kind === "element") {
        const el = take()
        nodes = el ? v.resolve(el) : []
      } else {
        nodes = v.resolve()
      }
      cursor = savedCursor
      cursorPos = savedPos
      return nodes
    }
    if (Array.isArray(v)) {
      const out: Node[] = []
      for (const item of v) out.push(...align(item))
      return out
    }
    if (v instanceof Node) return [v]
    return toNodes(v)
  }
  return align(value)
}

export function hydrateSuspend(props: { fallback?: unknown; children: unknown }): PendingNode {
  return new PendingNode("group", () => {
    const marker = take()
    if (!marker || marker.nodeType !== Node.COMMENT_NODE) {
      warn("expected suspend marker")
      return []
    }
    // 采纳 SSR 内容直到 <!--/suspend-->
    const adopted: Node[] = []
    while (cursorPos < cursor.length) {
      const node = take()
      if (
        node &&
        node.nodeType === Node.COMMENT_NODE &&
        (node as Comment).data === SUSPEND_END_MARKER
      ) {
        break
      }
      if (node) adopted.push(node)
    }
    const branches = createBranchManager(marker)
    branches.adopt(adopted)
    let seq = 0
    // fallback 与客户端 Suspend 一致:同一批节点反复换入换出,保留 watcher
    // (否则挂起 → 解析 → 再挂起后 fallback 内部绑定死亡);PendingNode 走
    // rebuild,不消费水合游标
    let fallbackNodes: Node[] | null = null
    let currentIsFallback = false

    const renderFallback = (): void => {
      if (!fallbackNodes) fallbackNodes = toBranchNodes(props.fallback)
      branches.swap(fallbackNodes, currentIsFallback)
      currentIsFallback = true
    }

    const discard = (value: unknown): void => {
      for (const n of toNodes(value)) cleanupWatchers(n)
    }

    const swapIn = (value: unknown): void => {
      branches.swap(toBranchNodes(value), currentIsFallback)
      currentIsFallback = false
    }

    const initialSeq = ++seq
    settleChildren(realizeLazy(unwrap(props.children)), {
      isStale: () => initialSeq !== seq,
      onPending: () => {},
      onResolved: resolved => {
        branches.swap(hydrateResolvedContent(resolved, adopted), false)
      },
      onRejected: reportError,
    })
    if (isSignal(props.children)) {
      const signal = props.children as WatchableSignal<unknown>
      const watcher = watchSignal(signal, () => {
        // 信号驱动的重渲染:挂起先 fallback,代际超车丢弃迟到结果
        const mySeq = ++seq
        settleChildren(realizeLazy(unwrap(signal)), {
          isStale: () => mySeq !== seq,
          onPending: renderFallback,
          onResolved: swapIn,
          onRejected: reportError,
          onSuperseded: discard,
        })
      })
      trackWatcher(marker, watcher)
    }
    trackCleanup(marker, () => {
      seq++ // 使在途 promise 的结果失效
      branches.cleanup()
      fallbackNodes = null
    })
    return [marker, ...branches.current]
  })
}

/**
 * 水合：把 `root()` 组件树对齐到 `container` 内由 SSR 产出的现有 DOM，
 * 挂上事件监听与信号绑定。返回 `dispose()` 用于卸载与清理。
 *
 * 假设：客户端初始状态与 SSR 一致（信号快照、分支选择、列表内容）。
 */
/**
 * 带状态恢复的水合：从容器内的 `<script id="kiko-state" type="application/json">`
 * 读取服务端序列化的信号状态，恢复后水合，使客户端信号初始值与服务端快照一致。
 *
 * 服务端配合：`startSignalCapture()` → `renderToFragment()` →
 * `signalStateScript()`（输出 `{"v":1,"s":[...]}` envelope，`<` 已转义防
 * `</script>` 破防）。也可直接传 `state` 参数（JSON 字符串 / envelope 对象），
 * 此时不依赖脚本标签。
 */
export function hydrateWithState(
  root: () => unknown,
  container: Element,
  state?: string | SerializedSignalState,
): () => void {
  if (state) {
    restoreSignals(state)
  } else {
    // 优先在容器内查找，否则在文档中查找（脚本可能在容器外）
    const script =
      container.querySelector('script[id="kiko-state"]') ??
      (typeof document !== "undefined" ? document.querySelector('script[id="kiko-state"]') : null)
    if (script?.textContent) restoreSignals(script.textContent)
  }
  try {
    return hydrate(root, container)
  } finally {
    stopSignalRestore()
  }
}

/**
 * 水合：把 `root()` 组件树对齐到 `container` 内由 SSR 产出的现有 DOM，
 * 挂上事件监听与信号绑定。返回 `dispose()` 用于卸载与清理。
 *
 * 假设：客户端初始状态与 SSR 一致（信号快照、分支选择、列表内容）。
 * 若服务端嵌入了信号状态，请用 `hydrateWithState()` 替代。
 *
 * `options.strict`:错位(游标耗尽/tag 不匹配/残留节点)从 console.error
 * 升级为 throw——测试与 CI 用,正常路径零成本。
 */
export function hydrate(
  root: () => unknown,
  container: Element,
  options?: { strict?: boolean },
): () => void {
  // 容器嵌入了序列化信号状态但走了裸 hydrate():信号全按客户端初始值,
  // 服务端状态被静默丢弃——几乎总是误用
  if (container.querySelector('script[id="kiko-state"]')?.textContent && !isRestoring()) {
    console.error(
      "[kiko hydrate] container embeds serialized signal state but hydrate() was called — use hydrateWithState() to restore it",
    )
  }
  const prevStrict = strictMode
  strictMode = options?.strict === true
  beginHydrate()
  try {
    const savedCursor = cursor
    const savedPos = cursorPos
    try {
      cursor = Array.from(container.childNodes)
      cursorPos = 0
      hydrateValue(root())
      if (cursorPos < cursor.length) {
        warn(`unmatched nodes remain in container (${cursor.length - cursorPos})`)
      }
    } finally {
      // 求值抛错也要恢复游标:游标是模块级单实例,半消费状态会污染
      // 后续的 hydrate() 调用
      cursor = savedCursor
      cursorPos = savedPos
    }
  } finally {
    endHydrate()
    strictMode = prevStrict
  }
  attachDelegationRoot(container)
  return () => {
    detachDelegationRoot(container)
    // 水合根级清理先于 watcher 拆除（Router dispose 等与节点无关，但保证
    // cleanup 先拿到完整状态）
    for (const fn of rootCleanups.splice(0)) {
      try {
        fn()
      } catch (err) {
        reportError(err)
      }
    }
    cleanupWatchers(container)
  }
}
