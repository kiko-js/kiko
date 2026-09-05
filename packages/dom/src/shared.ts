import { isLazy, realizeLazy } from "./lazy-node"
import { isSignal } from "./signal"
import type { WatchableSignal } from "./signal"

/**
 * Value-shape helpers shared by the DOM runtime paths (client jsx-runtime,
 * flow control, hydration, SSR). Pure functions — no DOM access.
 */

/** True for any thenable (native promise or a `{ then }` object). */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function"
}

/** SolidJS-style truthiness: `false`, nullish, `""` and `0` are falsy. */
export function isTruthy(cond: unknown): boolean {
  return cond !== false && cond != null && cond !== "" && cond !== 0
}

/** Read a value that may be a signal; plain values pass through. */
export function unwrap<T>(value: T | WatchableSignal<T>): T {
  return isSignal(value) ? (value as WatchableSignal<T>).get() : (value as T)
}

/**
 * For 无 getKey 时的默认 key:item 本身(Map 按 SameValueZero——对象/函数
 * 按引用复用节点,移动不重建;原始值按值)。重复 key(同一引用出现两次,或
 * 重复的原始值)会坍缩,调用方需检测并回退整表重建。
 */
export function defaultForKey(item: unknown): unknown {
  return item
}

/** Recursively stringify style children: signals resolve to their current
 * snapshot, arrays flatten, everything else becomes `String(value)`. */
export function extractCssText(children: unknown): string {
  const parts: string[] = []
  const visit = (value: unknown): void => {
    if (value == null || value === false || value === true) return
    if (isSignal(value)) {
      visit((value as WatchableSignal<unknown>).get())
      return
    }
    if (Array.isArray(value)) {
      for (const c of value) visit(c)
      return
    }
    parts.push(String(value))
  }
  visit(children)
  return parts.join("\n")
}

export interface SettleHandlers {
  /** 一次性判旧(代际快照):迟到结果不得覆盖新代内容 */
  isStale: () => boolean
  /** 存在在途 promise:先渲染挂起态(fallback) */
  onPending: () => void
  /** 全部 settle:以最新值渲染 */
  onResolved: (resolved: unknown) => void
  /** reject 且非过期 */
  onRejected: (error: unknown) => void
  /** 过期(被新代取代/已清理):迟到结果交此清理;缺省静默丢弃 */
  onSuperseded?: (resolved: unknown) => void
}

/**
 * Suspend 的 promise 收集(flow.ts 与 hydrate.ts 共用,语义与客户端路径一致):
 * children 为单个 promise 或「含 promise 的数组」时挂起,全部 settle 后以
 * 最新值回调;非过期才回调 onRejected/onResolved。数组子项先解包惰性组件
 * (async 组件的 Lazy)再做 promise 检测。
 */
export function settleChildren(value: unknown, h: SettleHandlers): void {
  let v = value
  if (Array.isArray(v)) v = v.map(item => (isLazy(item) ? realizeLazy(item) : item))
  if (isPromiseLike(v)) {
    h.onPending()
    Promise.resolve(v).then(
      r => (h.isStale() ? h.onSuperseded?.(r) : h.onResolved(r)),
      e => {
        if (!h.isStale()) h.onRejected(e)
      },
    )
    return
  }
  if (Array.isArray(v) && v.some(isPromiseLike)) {
    h.onPending()
    Promise.all(v).then(
      r => (h.isStale() ? h.onSuperseded?.(r) : h.onResolved(r)),
      e => {
        if (!h.isStale()) h.onRejected(e)
      },
    )
    return
  }
  h.onResolved(v)
}
