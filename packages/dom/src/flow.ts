import { Signal } from "signal-polyfill"
import { createWatcher, isSignal } from "./signal"
import type { WatchableSignal } from "./signal"
import {
  applyScopeRoots,
  cleanupWatchers,
  swapNodes,
  toNodes,
  trackCleanup,
  trackWatcher,
} from "./jsx-runtime"
import { getSSRRuntime } from "./ssr-mode"

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

function unwrap<T>(value: MaybeSignal<T>): T {
  return isSignal(value) ? (value as WatchableSignal<T>).get() : (value as T)
}

function isTruthy(cond: unknown): boolean {
  return cond !== false && cond != null && cond !== "" && cond !== 0
}

/**
 * Conditionally render `children` when `when` is truthy, else `fallback`.
 *
 * `when` may be a plain value or a `Signal.State`/`Signal.Computed`. When it
 * is a signal, the rendered content swaps reactively — truthy transitions
 * mount `children`, falsy transitions mount `fallback` and dispose the
 * previous subtree. `children` may be a function receiving the truthy value
 * (narrowed to `T`); it re-runs on every `when` change while truthy.
 */
export function Show<T>(props: {
  when: MaybeSignal<T | false | null | undefined>
  fallback?: unknown
  children: unknown | ((item: T) => unknown)
}): DocumentFragment {
  const ssr = getSSRRuntime()
  if (ssr) return ssr.show(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("show")
  frag.appendChild(marker)
  let current: Node[] = []
  let mounted = false

  const render = (): void => {
    const cond = unwrap(props.when)
    const truthy = isTruthy(cond)
    if (truthy) {
      const value =
        typeof props.children === "function"
          ? (props.children as (item: T) => unknown)(cond as T)
          : props.children
      current = swapNodes(marker, current, toNodes(value))
      mounted = true
    } else if (mounted) {
      current = swapNodes(marker, current, toNodes(props.fallback))
      mounted = false
    }
  }

  render()

  if (isSignal(props.when)) {
    const signal = props.when as WatchableSignal<unknown>
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
    mounted = false
  })

  return frag
}

interface KeyEntry<T> {
  nodes: Node[]
  state: Signal.State<T>
  accessor: Signal.Computed<T>
  idx: number
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
  const ssr = getSSRRuntime()
  if (ssr) return ssr.for(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("for")
  frag.appendChild(marker)
  let current: Node[] = []
  let entries: Map<unknown, KeyEntry<T>> = new Map()

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
        existing.idx = i
        entries.delete(key)
        nextEntries.set(key, existing)
        next.push(...existing.nodes)
      } else {
        const state = new Signal.State<T>(item)
        const accessor = new Signal.Computed<T>(() => state.get())
        const entry: KeyEntry<T> = { nodes: [], state, accessor, idx: i }
        entry.nodes = toNodes(
          childFn(
            () => accessor.get(),
            () => entry.idx,
          ),
        )
        nextEntries.set(key, entry)
        next.push(...entry.nodes)
      }
    }
    // Detach all current nodes first so a fixed `ref` re-inserts in order
    // (insertBefore(n, ref) with live survivors in place would reverse them).
    // removeChild keeps survivor watchers intact — only DOM position changes.
    if (parent) for (const n of current) parent.removeChild(n)
    // Dispose entries that dropped out of the list (watchers only — DOM
    // already detached above).
    for (const entry of entries.values()) {
      for (const n of entry.nodes) cleanupWatchers(n)
    }
    if (parent) {
      const ref = marker.nextSibling
      for (const n of next) {
        applyScopeRoots(n, parent)
        parent.insertBefore(n, ref)
      }
    }
    current = next
    entries = nextEntries
  }

  const render = (): void => {
    const list = unwrap(props.each) as readonly T[]
    if (props.getKey) renderKeyed(list)
    else renderFull(list)
  }

  render()

  if (isSignal(props.each)) {
    const signal = props.each as WatchableSignal<readonly T[]>
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
    entries = new Map()
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
  const ssr = getSSRRuntime()
  if (ssr) return ssr.errorBoundary(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("error-boundary")
  frag.appendChild(marker)
  let current: Node[] = []

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
      current = swapNodes(marker, current, toNodes(fb))
      return
    }
    try {
      current = swapNodes(marker, current, toNodes(childrenComputed.get()))
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
      current = swapNodes(marker, current, toNodes(fb))
    }
  }

  render()

  // Re-render when the children's signals change. The computed re-evaluates
  // under the watcher; a throw is caught the same way as on initial render.
  const watcher = createWatcher(() => {
    queueMicrotask(() => {
      // While in error state, ignore children notifications so a still-throwing
      // children does not loop. `resetWatcher` handles retry.
      if (error.get() !== null) {
        watcher.watch(childrenComputed)
        return
      }
      render()
      watcher.watch(childrenComputed)
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
      if (error.get() === null) {
        resetWatcher.watch(reset)
        return
      }
      // Only react to an explicit `reset.set()` write, not unrelated invalidation.
      // Consume by re-reading; if the caller wrote reset, the watcher fired.
      reset.get()
      error.set(null)
      render()
      watcher.watch(childrenComputed)
      resetWatcher.watch(reset)
    })
  })
  resetWatcher.watch(reset)
  trackWatcher(marker, resetWatcher)

  trackCleanup(marker, () => {
    for (const n of current) cleanupWatchers(n)
    current = []
  })

  return frag
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function"
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
  const ssr = getSSRRuntime()
  if (ssr) return ssr.suspend(props as Record<string, unknown>) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  const marker = document.createComment("suspend")
  frag.appendChild(marker)
  let current: Node[] = []
  // 代际计数器：每次重渲染 +1，令在途 promise 的迟到结果失效（supersede）
  let seq = 0

  const render = (value: unknown): void => {
    current = swapNodes(marker, current, toNodes(value))
  }

  const renderFallback = (): void => {
    current = swapNodes(marker, current, toNodes(props.fallback))
  }

  // 被 supersede / 清理时丢弃的已解析节点：清理其内部 watcher，避免泄漏
  const discard = (value: unknown): void => {
    for (const n of toNodes(value)) cleanupWatchers(n)
  }

  const handleError = (error: unknown): void => {
    if (typeof reportError === "function") reportError(error)
    else
      queueMicrotask(() => {
        throw error
      })
  }

  // 收集 children 中的 promise：挂起则先渲染 fallback，settle 后换入结果
  const settle = (value: unknown, mySeq: number): void => {
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
    settle(value, mySeq)
  }

  renderValue(unwrap(props.children))

  if (isSignal(props.children)) {
    const signal = props.children as WatchableSignal<unknown>
    const watcher = createWatcher(() => {
      queueMicrotask(() => {
        renderValue(unwrap(signal))
        watcher.watch(signal)
      })
    })
    watcher.watch(signal)
    trackWatcher(marker, watcher)
  }

  trackCleanup(marker, () => {
    seq++ // 使在途 promise 的结果失效
    for (const n of current) cleanupWatchers(n)
    current = []
  })

  return frag
}
