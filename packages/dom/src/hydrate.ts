import { createWatcher, isSignal } from "./signal"
import type { WatchableSignal } from "./signal"
import {
  cleanupWatchers,
  setProp,
  swapNodes,
  toNodes,
  trackCleanup,
  trackWatcher,
} from "./jsx-runtime"
import type { AsyncComponent, Component, Props } from "./jsx-runtime"

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

// 当前游标：采纳中的节点列表与位置
let cursor: Node[] = []
let cursorPos = 0

function take(): Node | undefined {
  return cursor[cursorPos++]
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function"
}

function unwrap<T>(value: T | WatchableSignal<T>): T {
  return isSignal(value) ? (value as WatchableSignal<T>).get() : (value as T)
}

function isTruthy(cond: unknown): boolean {
  return cond !== false && cond != null && cond !== "" && cond !== 0
}

function warn(message: string): void {
  console.error(`[kiko hydrate] ${message}`)
}

/**
 * 待采纳节点：element 类型取游标 1 个节点后调用 resolve(el)；
 * group 类型（Fragment / 控制流）不取节点，resolve() 自行按标记采纳。
 */
class PendingNode {
  constructor(
    readonly kind: "element" | "group",
    readonly resolve: (el?: Node) => Node[],
  ) {}
}

/** 采纳一个值对应的现有节点（按 SSR 标记与结构逐一对齐） */
function hydrateValue(value: unknown): Node[] {
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
    const node = take()
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      warn("expected text node")
      return []
    }
    return [node]
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
  hydrateValue(props.children)
  if (cursorPos < cursor.length) {
    warn(`unmatched children remain in <${tag}> (${cursor.length - cursorPos})`)
  }
  cursor = savedCursor
  cursorPos = savedPos
}

export function hydrateJsx(
  tag: string | Component<any> | AsyncComponent<any>,
  props: Props | null,
): unknown {
  const p = props ?? ({} as Props)

  if (typeof tag === "function") {
    // 组件：透传其返回值（PendingNode / 数组 / 文本），由父级游标对齐
    return tag(p) as unknown as unknown
  }

  if (tag === "style") {
    // <style>：采纳现有元素（SSR 已输出；不做 constructable sheet 优化）
    return new PendingNode("element", el => [el!])
  }

  return new PendingNode("element", el => {
    hydrateElement(el!, tag, p)
    return [el!]
  })
}

export function hydrateFragment(children: unknown): PendingNode {
  return new PendingNode("group", () => hydrateValue(children))
}

export function hydrateStyle(): PendingNode {
  return new PendingNode("element", el => [el!])
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
  const watcher = createWatcher(() => {
    queueMicrotask(() => {
      render()
      watcher.watch(signal)
    })
  })
  watcher.watch(signal)
  trackWatcher(marker, watcher)
  trackCleanup(marker, () => {
    for (const n of current) cleanupWatchers(n)
    current = []
  })
  return [marker, ...current]
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
    let current = hydrateValue(branch())
    if (isSignal(props.when)) {
      const signal = props.when as WatchableSignal<unknown>
      const render = (): void => {
        current = swapNodes(marker, current, toNodes(branch()))
      }
      const watcher = createWatcher(() => {
        queueMicrotask(() => {
          render()
          watcher.watch(signal)
        })
      })
      watcher.watch(signal)
      trackWatcher(marker, watcher)
    }
    trackCleanup(marker, () => {
      for (const n of current) cleanupWatchers(n)
      current = []
    })
    return [marker, ...current]
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
    const items = (): readonly unknown[] => unwrap(props.each) as readonly unknown[]
    const renderList = (): Node[] => {
      const out: Node[] = []
      const list = items()
      for (let i = 0; i < list.length; i++) {
        const index = (): number => i
        const arg = props.getKey ? () => list[i] : list[i]
        out.push(...hydrateValue(props.children(arg, index)))
      }
      return out
    }
    let current = renderList()
    if (isSignal(props.each)) {
      const signal = props.each as WatchableSignal<readonly unknown[]>
      const render = (): void => {
        const next: Node[] = []
        const list = unwrap(signal)
        for (let i = 0; i < list.length; i++) {
          const index = (): number => i
          const arg = props.getKey ? () => list[i] : list[i]
          next.push(...toNodes(props.children(arg, index)))
        }
        current = swapNodes(marker, current, next)
      }
      const watcher = createWatcher(() => {
        queueMicrotask(() => {
          render()
          watcher.watch(signal)
        })
      })
      watcher.watch(signal)
      trackWatcher(marker, watcher)
    }
    trackCleanup(marker, () => {
      for (const n of current) cleanupWatchers(n)
      current = []
    })
    return [marker, ...current]
  })
}

export function hydrateErrorBoundary(props: {
  fallback?: unknown | ((error: unknown) => unknown)
  onError?: (error: unknown) => void
  children: () => unknown
}): PendingNode {
  return new PendingNode("group", () => {
    const marker = take()
    if (!marker || marker.nodeType !== Node.COMMENT_NODE) {
      warn("expected error-boundary marker")
      return []
    }
    let current: Node[]
    try {
      current = hydrateValue(props.children())
    } catch (e) {
      try {
        props.onError?.(e)
      } catch {
        // onError 是用户代码，不能破坏错误边界
      }
      const fb =
        typeof props.fallback === "function"
          ? (props.fallback as (error: unknown) => unknown)(e)
          : props.fallback
      current = hydrateValue(fb)
    }
    trackCleanup(marker, () => {
      for (const n of current) cleanupWatchers(n)
    })
    return [marker, ...current]
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
      if (node && node.nodeType === Node.COMMENT_NODE && (node as Comment).data === "/suspend") {
        break
      }
      if (node) adopted.push(node)
    }
    let current = adopted
    const children = unwrap(props.children)
    if (isPromiseLike(children)) {
      // 内容解析后：PendingNode 对齐到采纳节点（绑定生效），真实节点直接换入
      Promise.resolve(children).then(
        resolved => {
          current = swapNodes(marker, current, hydrateResolvedContent(resolved, adopted))
        },
        rejected => {
          if (typeof reportError === "function") reportError(rejected)
        },
      )
    }
    trackCleanup(marker, () => {
      for (const n of current) cleanupWatchers(n)
      current = []
    })
    return [marker, ...current]
  })
}

/**
 * 水合：把 `root()` 组件树对齐到 `container` 内由 SSR 产出的现有 DOM，
 * 挂上事件监听与信号绑定。返回 `dispose()` 用于卸载与清理。
 *
 * 假设：客户端初始状态与 SSR 一致（信号快照、分支选择、列表内容）。
 */
export function hydrate(root: () => unknown, container: Element): () => void {
  beginHydrate()
  try {
    const savedCursor = cursor
    const savedPos = cursorPos
    cursor = Array.from(container.childNodes)
    cursorPos = 0
    hydrateValue(root())
    if (cursorPos < cursor.length) {
      warn(`unmatched nodes remain in container (${cursor.length - cursorPos})`)
    }
    cursor = savedCursor
    cursorPos = savedPos
  } finally {
    endHydrate()
  }
  return () => cleanupWatchers(container)
}
