import { Signal } from "signal-polyfill"
import { isLazy, realizeLazy } from "./lazy-node"
import { createWatcher, isSignal, reportError, watchSignal } from "./signal"
import type { WatchableSignal } from "./signal"
import {
  applyScopeRoots,
  cleanupWatchers,
  swapBranch,
  swapNodes,
  toNodes,
  trackCleanup,
  trackWatcher,
} from "./jsx-runtime"
import { isPromiseLike, isTruthy, unwrap, defaultForKey } from "./shared"
import { getSSRRuntime } from "./ssr-mode"
import {
  hydrateErrorBoundary,
  hydrateFor,
  hydrateShow,
  hydrateSuspend,
  isHydrating,
} from "./hydrate"

/**
 * Structural-reactivity helpers: `Show` and `For` are optional control-flow
 * components. They build on the standard signal primitives — no extra
 * reactivity model — so the library stays 100% signal-polyfill compatible.
 *
 * Both return a `DocumentFragment` containing a comment marker followed by the
 * current content; the marker anchors reactive swaps when the bound signal
 * changes. Watchers and cleanups are tracked on the marker so `cleanupWatchers`
 * disposes them when the host subtree is torn down.
 */

type MaybeSignal<T> = T | WatchableSignal<T>

/**
 * Conditionally render `children` when `when` is truthy, else `fallback`.
 *
 * `when` may be a plain value or a `Signal.State`/`Signal.Computed`. When it
 * is a signal, the rendered content swaps reactively — truthy transitions
 * mount `children`, falsy transitions mount `fallback` and dispose the
 * previous subtree. `children` may be a function receiving the truthy value
 * (narrowed to `T`); it re-runs on every `when` change while truthy.
 *
 * 静态（非函数）children / fallback 是同一批节点：切换分支时保留其 watcher
 * （`swapBranch` 保留式换出），换回时内部信号绑定仍然存活——否则
 * cleanupWatchers 删除 watcher 集后重挂载的节点是"死"的。
 */
export function Show<T>(props: {
  when: MaybeSignal<T | false | null | undefined>
  fallback?: unknown
  children: unknown | ((item: T) => unknown)
}): DocumentFragment {
  if (isHydrating()) {
    return hydrateShow(
      props as unknown as Parameters<typeof hydrateShow>[0],
    ) as unknown as DocumentFragment
  }
  const ssr = getSSRRuntime()
  if (ssr) return ssr.show(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("show")
  frag.appendChild(marker)
  let current: Node[] = []
  // 静态分支的节点数组（惰性求值一次）；换出时保留，换回时复用
  let truthyNodes: Node[] | null = null
  let fallbackNodes: Node[] | null = null
  // 当前可见分支是否来自静态来源（决定换出时是否保留 watcher）
  let currentRetained = false

  const render = (): void => {
    const cond = unwrap(props.when)
    const truthy = isTruthy(cond)
    if (truthy) {
      if (typeof props.children === "function") {
        const value = (props.children as (item: T) => unknown)(cond as T)
        current = swapBranch(marker, current, toNodes(value), currentRetained)
        currentRetained = false
      } else {
        if (!truthyNodes) truthyNodes = toNodes(props.children)
        current = swapBranch(marker, current, truthyNodes, currentRetained)
        currentRetained = true
      }
    } else {
      if (!fallbackNodes) fallbackNodes = toNodes(props.fallback)
      current = swapBranch(marker, current, fallbackNodes, currentRetained)
      currentRetained = true
    }
  }

  render()

  if (isSignal(props.when)) {
    const signal = props.when as WatchableSignal<unknown>
    const watcher = watchSignal(signal, render)
    trackWatcher(marker, watcher)
  }

  trackCleanup(marker, () => {
    for (const n of current) cleanupWatchers(n)
    // 保留中的隐藏分支也要清理（watcher 一直存活）
    if (truthyNodes && truthyNodes !== current) {
      for (const n of truthyNodes) cleanupWatchers(n)
    }
    if (fallbackNodes && fallbackNodes !== current) {
      for (const n of fallbackNodes) cleanupWatchers(n)
    }
    current = []
    truthyNodes = null
    fallbackNodes = null
  })

  return frag
}

interface KeyEntry<T> {
  nodes: Node[]
  state: Signal.State<T>
  accessor: Signal.Computed<T>
  idx: Signal.State<number>
}

/**
 * Render a list. `each` may be a plain array or a signal of an array.
 *
 * - Without `getKey`: the children function receives the item VALUE and an
 *   index accessor; the whole list re-renders on `each` change. Simple and
 *   correct for small/medium lists.
 * - With `getKey`: the children function receives an item ACCESSOR `() => T`
 *   (reading it tracks the entry's state, so in-place updates to a surviving
 *   entry update its bindings WITHOUT re-running the function) plus an index
 *   accessor. Entries are reconciled by key: surviving keys keep their DOM
 *   nodes and children-fn state, removed keys are disposed, new keys are
 *   created and inserted in the right position — so the children function
 *   runs at most once per key over the list's lifetime.
 */
export function For<T>(props: {
  each: MaybeSignal<readonly T[]>
  getKey: (item: T, index: number) => unknown
  children: (item: () => NoInfer<T>, index: () => number) => unknown
}): DocumentFragment
export function For<T>(props: {
  each: MaybeSignal<readonly T[]>
  children: (item: NoInfer<T>, index: () => number) => unknown
}): DocumentFragment
// Implementation signature is loose on the children arg type; the two public
// overloads above provide precise contextual typing (value for non-keyed,
// accessor for keyed) so call-site arrow params infer correctly.
export function For<T>(props: {
  each: MaybeSignal<readonly T[]>
  getKey?: (item: T, index: number) => unknown
  children: (item: T | (() => T), index: () => number) => unknown
}): DocumentFragment {
  if (isHydrating()) {
    return hydrateFor(
      props as unknown as Parameters<typeof hydrateFor>[0],
    ) as unknown as DocumentFragment
  }
  const ssr = getSSRRuntime()
  if (ssr) return ssr.for(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("for")
  frag.appendChild(marker)
  let current: Node[] = []
  let entries: Map<unknown, KeyEntry<T>> = new Map()
  let plain: Map<unknown, Node[]> = new Map()

  const renderFull = (list: readonly T[]): void => {
    const next: Node[] = []
    for (let i = 0; i < list.length; i++) {
      const item = list[i] as T
      const index = (): number => i
      next.push(
        ...toNodes((props.children as (item: T, index: () => number) => unknown)(item, index)),
      )
    }
    current = swapNodes(marker, current, next)
    entries = new Map()
    plain = new Map()
  }

  /**
   * 最小移动重排（SolidJS-style）：丢弃 dropped 节点的 watcher（DOM 仍挂在
   * `current` 里），移除不再存活的节点，存活节点按 `next` 顺序以单次后向
   * 插入锚定到 marker。返回 `next`。
   */
  const reconcileList = (
    parent: Node | null,
    marker: Node,
    currentNodes: Node[],
    next: Node[],
    droppedNodes: Node[][],
  ): Node[] => {
    for (const nodes of droppedNodes) {
      for (const n of nodes) cleanupWatchers(n)
    }
    if (!parent) return next
    const keep = new Set(next)
    for (const n of currentNodes) {
      if (!keep.has(n)) parent.removeChild(n)
    }
    let ref: Node = marker
    for (let i = next.length - 1; i >= 0; i--) {
      const node = next[i] as Node
      if (node.nextSibling !== ref) parent.insertBefore(node, ref)
      applyScopeRoots(node, parent)
      ref = node
    }
    return next
  }

  /**
   * 默认 keying（无 getKey）：key = 条目本身（SameValueZero）——对象/函数按
   * 引用复用节点（移动不重建、children 不重跑），原始值按值复用。重复条目
   * （同一引用出现两次，或重复的原始值）会坍缩 key → 回退整表重建。
   */
  const renderDefaultKeyed = (list: readonly T[]): void => {
    const parent = marker.parentNode
    const next: Node[] = []
    const nextPlain = new Map<unknown, Node[]>()
    const childFn = props.children as (item: T, index: () => number) => unknown
    let fallback = false
    const seen = new Set<unknown>()
    for (let i = 0; i < list.length; i++) {
      const item = list[i] as T
      const key = defaultForKey(item)
      if (seen.has(key)) {
        fallback = true
        break
      }
      seen.add(key)
      const existing = plain.get(key)
      if (existing) {
        nextPlain.set(key, existing)
        next.push(...existing)
      } else {
        const nodes = toNodes(childFn(item, () => i))
        nextPlain.set(key, nodes)
        next.push(...nodes)
      }
    }
    if (fallback) {
      renderFull(list)
      return
    }
    const dropped: Node[][] = []
    for (const [key, nodes] of plain) {
      if (!nextPlain.has(key)) dropped.push(nodes)
    }
    current = reconcileList(parent, marker, current, next, dropped)
    plain = nextPlain
    entries = new Map()
  }

  const renderKeyed = (list: readonly T[]): void => {
    const parent = marker.parentNode
    const next: Node[] = []
    const nextEntries = new Map<unknown, KeyEntry<T>>()
    const childFn = props.children as (item: () => T, index: () => number) => unknown
    for (let i = 0; i < list.length; i++) {
      const item = list[i] as T
      const key = props.getKey!(item, i)
      const existing = entries.get(key)
      if (existing) {
        existing.state.set(item)
        existing.idx.set(i)
        entries.delete(key)
        nextEntries.set(key, existing)
        next.push(...existing.nodes)
      } else {
        const state = new Signal.State<T>(item)
        const accessor = new Signal.Computed<T>(() => state.get())
        const entry: KeyEntry<T> = { nodes: [], state, accessor, idx: new Signal.State(i) }
        entry.nodes = toNodes(
          childFn(
            () => accessor.get(),
            () => entry.idx.get(),
          ),
        )
        nextEntries.set(key, entry)
        next.push(...entry.nodes)
      }
    }
    const dropped: Node[][] = []
    for (const entry of entries.values()) dropped.push(entry.nodes)
    current = reconcileList(parent, marker, current, next, dropped)
    entries = nextEntries
    plain = new Map()
  }

  const render = (): void => {
    const list = unwrap(props.each) as readonly T[]
    if (props.getKey) renderKeyed(list)
    else renderDefaultKeyed(list)
  }

  render()

  if (isSignal(props.each)) {
    const signal = props.each as WatchableSignal<readonly T[]>
    const watcher = watchSignal(signal, render)
    trackWatcher(marker, watcher)
  }

  trackCleanup(marker, () => {
    for (const n of current) cleanupWatchers(n)
    current = []
    entries = new Map()
    plain = new Map()
  })

  return frag
}

/**
 * Catch rendering errors in `children` and swap to `fallback`.
 *
 * `children` is a function (deferred so its evaluation can be wrapped in
 * try/catch); it is evaluated inside a `Signal.Computed` so both the initial
 * render and any signal-driven re-render flow through one tracked evaluation.
 * If that evaluation throws, the error is captured into `errorSignal` (when
 * provided), the optional `onError(err)` callback fires, and the subtree
 * swaps to `fallback`. `fallback` may be a function receiving the captured
 * error.
 *
 * Writing `resetSignal` (with a distinct value — `Signal.State` skips
 * notification when the value is unchanged, so use a counter or `Date.now()`)
 * after an error retries the children; a successful retry clears the error
 * and swaps back to the children subtree. Provide `resetSignal`/`errorSignal`
 * from the caller to drive retry and inspect the error; `ErrorBoundary`
 * returns the mounted `DocumentFragment` so it composes like `Show`/`For`.
 *
 * Scope: catches synchronous errors thrown while evaluating the children
 * (initial mount + signal-driven re-renders). Errors thrown inside event
 * handlers or other async callbacks outside the render path are NOT caught —
 * those surface via the host `reportError` hook, matching SolidJS semantics.
 */
export function ErrorBoundary(props: {
  fallback?: (error: unknown) => unknown
  onError?: (error: unknown) => void
  resetSignal?: Signal.State<unknown>
  errorSignal?: Signal.State<unknown>
  children: () => unknown
}): DocumentFragment
export function ErrorBoundary(props: {
  fallback?: unknown
  onError?: (error: unknown) => void
  resetSignal?: Signal.State<unknown>
  errorSignal?: Signal.State<unknown>
  children: () => unknown
}): DocumentFragment
export function ErrorBoundary(props: {
  fallback?: unknown
  onError?: (error: unknown) => void
  resetSignal?: Signal.State<unknown>
  errorSignal?: Signal.State<unknown>
  children: () => unknown
}): DocumentFragment {
  if (isHydrating()) {
    return hydrateErrorBoundary(
      props as unknown as Parameters<typeof hydrateErrorBoundary>[0],
    ) as unknown as DocumentFragment
  }
  const ssr = getSSRRuntime()
  if (ssr) return ssr.errorBoundary(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("error-boundary")
  frag.appendChild(marker)
  let current: Node[] = []
  // fallback 为 eager 值时是同一批节点：换出保留 watcher，换回后绑定存活
  let fallbackNodes: Node[] | null = null
  let currentIsFallback = false

  // Caller-owned signals, when given, are the source of truth so the caller
  // can drive retry/reset. Local fallbacks keep the boundary usable without them.
  const reset = props.resetSignal ?? new Signal.State<unknown>(undefined)
  const error = props.errorSignal ?? new Signal.State<unknown>(null)

  // The children are evaluated lazily inside a computed so signal-driven
  // re-renders re-enter through the same try/catch. Reading `reset` makes
  // `reset.set()` invalidate the computed even when nothing else changed.
  const childrenComputed = new Signal.Computed<unknown>(() => {
    reset.get()
    return props.children()
  })

  const render = (): void => {
    if (error.get() !== null) {
      const fb =
        typeof props.fallback === "function"
          ? (props.fallback as (e: unknown) => unknown)(error.get())
          : props.fallback
      if (typeof props.fallback === "function") {
        // 动态 fallback：每次重建，换出时完整清理
        current = swapBranch(marker, current, toNodes(fb), currentIsFallback)
        currentIsFallback = false
      } else {
        if (!fallbackNodes) fallbackNodes = toNodes(fb)
        current = swapBranch(marker, current, fallbackNodes, currentIsFallback)
        currentIsFallback = true
      }
      return
    }
    try {
      current = swapBranch(marker, current, toNodes(childrenComputed.get()), currentIsFallback)
      currentIsFallback = false
    } catch (e) {
      error.set(e)
      try {
        props.onError?.(e)
      } catch {
        // onError is user code; never let it break the boundary.
      }
      // Mount fallback synchronously so the DOM never briefly reflects a
      // half-rendered throwing subtree.
      const fb =
        typeof props.fallback === "function"
          ? (props.fallback as (e: unknown) => unknown)(e)
          : props.fallback
      if (typeof props.fallback === "function") {
        current = swapBranch(marker, current, toNodes(fb), currentIsFallback)
        currentIsFallback = false
      } else {
        if (!fallbackNodes) fallbackNodes = toNodes(fb)
        current = swapBranch(marker, current, fallbackNodes, currentIsFallback)
        currentIsFallback = true
      }
    }
  }

  render()

  // Re-render when the children's signals change. The computed re-evaluates
  // under the watcher; a throw is caught the same way as on initial render.
  // re-arm 在 finally 中：渲染抛错不会让绑定永久失效。
  const watcher = createWatcher(() => {
    queueMicrotask(() => {
      try {
        // While in error state, ignore children notifications so a still-throwing
        // children does not loop. `resetWatcher` handles retry.
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

  // `reset.set()` clears the error and retries the children. Reading `reset`
  // here tracks it; clearing `error` invalidates `childrenComputed` (which
  // reads `reset`), so the children re-evaluate on the next flush — but we
  // also render synchronously so the fallback swaps out immediately.
  const resetWatcher = createWatcher(() => {
    queueMicrotask(() => {
      try {
        // Only react to an explicit `reset.set()` write, not unrelated invalidation.
        // Consume by re-reading; if the caller wrote reset, the watcher fired.
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
    for (const n of current) cleanupWatchers(n)
    if (fallbackNodes && fallbackNodes !== current) {
      for (const n of fallbackNodes) cleanupWatchers(n)
    }
    current = []
    fallbackNodes = null
  })

  return frag
}

/**
 * Suspend: render `fallback` while any promise in `children` is pending, then
 * swap to the resolved DOM once every promise has settled.
 *
 * `children` may be:
 * - A signal whose value is a promise / array-with-promises / plain node.
 *   When the signal changes, the pending promise is superseded — its late
 *   result is discarded (and its watchers cleaned) instead of overwriting
 *   the newer content.
 * - A promise (native or thenable), e.g. produced by `lazy(loader)()` or an
 *   async component called inside the Suspend.
 * - An array of promises and/or plain nodes.
 * - A plain node value (renders immediately, no fallback shown).
 *
 * Multiple promises are treated as a single unit via `Promise.all`; the
 * fallback stays on screen until all promises resolve. If any promise rejects,
 * the error is reported via `reportError` and `fallback` stays on screen.
 */
export function Suspend(props: { fallback?: unknown; children: unknown }): DocumentFragment {
  if (isHydrating()) {
    return hydrateSuspend(
      props as unknown as Parameters<typeof hydrateSuspend>[0],
    ) as unknown as DocumentFragment
  }
  const ssr = getSSRRuntime()
  if (ssr) return ssr.suspend(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("suspend")
  frag.appendChild(marker)
  let current: Node[] = []
  // fallback 是 eager 值：同一批节点反复换入换出，保留 watcher（否则
  // 挂起 → 解析 → 再挂起后 fallback 内部绑定死亡）
  let fallbackNodes: Node[] | null = null
  let currentIsFallback = false
  // 代际计数器：每次重渲染 +1，令在途 promise 的迟到结果失效（supersede）
  let seq = 0

  const render = (value: unknown): void => {
    current = swapBranch(marker, current, toNodes(value), currentIsFallback)
    currentIsFallback = false
  }

  const renderFallback = (): void => {
    if (!fallbackNodes) fallbackNodes = toNodes(props.fallback)
    current = swapBranch(marker, current, fallbackNodes, currentIsFallback)
    currentIsFallback = true
  }

  // 被 supersede / 清理时丢弃的已解析节点：清理其内部 watcher，避免泄漏
  const discard = (value: unknown): void => {
    for (const n of toNodes(value)) cleanupWatchers(n)
  }

  const handleError = (error: unknown): void => {
    reportError(error)
  }

  // 收集 children 中的 promise：挂起则先渲染 fallback，settle 后换入结果
  const settle = (value: unknown, mySeq: number): void => {
    // 数组子项可能是惰性组件（async 组件的 Lazy）：先解包再做 promise 检测
    if (Array.isArray(value)) value = value.map(item => (isLazy(item) ? realizeLazy(item) : item))
    if (isPromiseLike(value)) {
      renderFallback()
      value.then(
        resolved => {
          if (mySeq !== seq) {
            discard(resolved)
            return
          }
          render(resolved)
        },
        rejected => {
          if (mySeq === seq) handleError(rejected)
        },
      )
      return
    }
    if (Array.isArray(value) && value.some(isPromiseLike)) {
      renderFallback()
      Promise.all(value).then(
        resolved => {
          if (mySeq !== seq) {
            discard(resolved)
            return
          }
          render(resolved)
        },
        rejected => {
          if (mySeq === seq) handleError(rejected)
        },
      )
      return
    }
    render(value)
  }

  const renderValue = (value: unknown): void => {
    const mySeq = ++seq
    settle(realizeLazy(value), mySeq)
  }

  renderValue(unwrap(props.children))

  if (isSignal(props.children)) {
    const signal = props.children as WatchableSignal<unknown>
    const watcher = watchSignal(signal, () => renderValue(unwrap(signal)))
    trackWatcher(marker, watcher)
  }

  trackCleanup(marker, () => {
    seq++ // 使在途 promise 的结果失效
    for (const n of current) cleanupWatchers(n)
    if (fallbackNodes && fallbackNodes !== current) {
      for (const n of fallbackNodes) cleanupWatchers(n)
    }
    current = []
    fallbackNodes = null
  })

  return frag
}
