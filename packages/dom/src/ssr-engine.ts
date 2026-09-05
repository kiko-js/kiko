/**
 * SSR 共享引擎：块树 IR + 叶序列化 + 控制流语义单源。
 *
 * 字符串模式（`ssr.ts` → `renderToFragment`）与流式模式（`ssr-stream.ts` →
 * `renderToStream`）是同一棵块树上的两个 walker：
 * - 字符串模式把整棵树 join 成一个字符串（`chunksToSSRValue`，全同步时保持同步）；
 * - 流式模式按文档序遍历，同步叶立即 flush，异步叶 await 后继续（`flushChunks`）。
 *
 * Show / For / ErrorBoundary / Suspend 的 SSR 语义（标记位置、truthy 判定、
 * children 函数调用约定、fallback 渲染、reject 上报）只在这里实现一次——
 * 两个模式的控制流组件都是对本模块 `control*` 的直接或薄包装引用。
 *
 * 元素序列化（`ssrJsx` / `streamJsx`）不在此单源化：scoped `<Style>` 需要把
 * scope 标记回溯到祖先 opening tag，字符串模式序列化完 children 后重写自身
 * opening tag 即可；流式模式 opening tag 已 flush、无法回溯（见 ssr-stream
 * 文件头的已知限制）。这是两个模式真实存在的结构性差异，不是重复实现。
 */

import {
  ERROR_BOUNDARY_MARKER,
  FOR_MARKER,
  SHOW_MARKER,
  SIGNAL_MARKER_HTML,
  SUSPEND_END_MARKER,
  SUSPEND_MARKER,
  markerHtml,
} from "./markers"
import { isSignal, reportError } from "./signal"
import type { WatchableSignal } from "./signal"
import { isPromiseLike, isTruthy, unwrap } from "./shared"

// ---------------------------------------------------------------------------
// 基础序列化原语（字符串模式与流式模式共用）
/** 已序列化的 HTML 标记（区别于需要转义的纯文本字符串）。 */
export class SSRElement {
  constructor(readonly html: string) {}
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

export function camelToKebab(key: string): string {
  return /[A-Z]/.test(key) ? key.replace(/[A-Z]/g, m => "-" + m.toLowerCase()) : key
}

export function escapeStyleText(css: string): string {
  // Prevent `</style>` in CSS from closing the element early and enabling
  // markup injection. The backslash keeps the HTML parser from seeing a tag
  // while remaining valid CSS text for the common breaking sequence.
  return css.replace(/<\/style/gi, "<\\/style")
}

// ---------------------------------------------------------------------------
// 块树：SSR 渲染的中间表示
// ---------------------------------------------------------------------------

/** 同步 HTML 片段（可立即输出） */
export type SyncChunk = { kind: "sync"; html: string }
/** 异步块：promise resolve 后产出子块树 */
export type AsyncChunk = { kind: "async"; promise: Promise<StreamChunk[]> }
/** 子块序列（保持文档序） */
export type SequenceChunk = { kind: "sequence"; chunks: StreamChunk[] }
/** 空块（null/false/void 等） */
export type EmptyChunk = { kind: "empty" }

export type StreamChunk = SyncChunk | AsyncChunk | SequenceChunk | EmptyChunk

/** 同步块工厂 @internal */
export function sync(html: string): SyncChunk {
  return { kind: "sync", html }
}

/** 空块单例 */
const EMPTY: EmptyChunk = { kind: "empty" }

/** 类型守卫：值是否已是块树节点 */
function isStreamChunk(value: unknown): value is StreamChunk {
  return typeof value === "object" && value !== null && "kind" in value
}

// ---------------------------------------------------------------------------
// 核心：值 → 块树
// ---------------------------------------------------------------------------

/** 把任意 SSR 值转换为块树（已 chunk 化的值直接透传） */
export function streamValue(value: unknown): StreamChunk {
  if (value == null || value === false || value === true) return EMPTY
  if (isStreamChunk(value)) return value
  if (value instanceof SSRElement) return sync(value.html)
  if (isSignal(value)) {
    return {
      kind: "sequence",
      chunks: [sync(SIGNAL_MARKER_HTML), streamValue((value as WatchableSignal<unknown>).get())],
    }
  }
  if (isPromiseLike(value)) {
    return { kind: "async", promise: Promise.resolve(value).then(resolved => chunkify(resolved)) }
  }
  if (typeof value === "string" || typeof value === "number") return sync(escapeText(String(value)))
  if (Array.isArray(value)) {
    const chunks: StreamChunk[] = []
    for (const item of value) chunks.push(streamValue(item))
    return { kind: "sequence", chunks }
  }
  return sync(escapeText(String(value)))
}

/** 把已解析的异步值转为块数组（用于 async chunk 的 promise） */
function chunkify(value: unknown): StreamChunk[] {
  if (value == null || value === false || value === true) return []
  if (Array.isArray(value)) {
    const chunks: StreamChunk[] = []
    for (const item of value) chunks.push(streamValue(item))
    return chunks
  }
  return [streamValue(value)]
}

// ---------------------------------------------------------------------------
// 控制流语义（唯一实现；两个模式的运行时都引用这里）
// ---------------------------------------------------------------------------

/** 流式模式在异步叶 resolve 时临时换回块树运行时的钩子；字符串模式整树
 * await 都发生在运行时窗口内，无需换入。 */
export interface ControlFlowHooks {
  reenterRuntime?: () => () => void
}

export function controlShow(props: {
  when: unknown
  fallback?: unknown
  children: unknown | ((value: unknown) => unknown)
}): StreamChunk {
  const cond = unwrap(props.when)
  if (isTruthy(cond)) {
    const value =
      typeof props.children === "function"
        ? (props.children as (value: unknown) => unknown)(cond)
        : props.children
    return { kind: "sequence", chunks: [sync(markerHtml(SHOW_MARKER)), streamValue(value)] }
  }
  return { kind: "sequence", chunks: [sync(markerHtml(SHOW_MARKER)), streamValue(props.fallback)] }
}

export function controlFor(props: {
  each: unknown
  getKey?: (item: unknown, index: number) => unknown
  children: (item: unknown, index: () => number) => unknown
}): StreamChunk {
  const list = unwrap(props.each) as readonly unknown[]
  const chunks: StreamChunk[] = [sync(markerHtml(FOR_MARKER))]
  for (let i = 0; i < list.length; i++) {
    const index = (): number => i
    const arg = props.getKey ? () => list[i] : list[i]
    chunks.push(streamValue(props.children(arg, index)))
  }
  return { kind: "sequence", chunks }
}

export function controlErrorBoundary(props: {
  fallback?: unknown | ((error: unknown) => unknown)
  onError?: (error: unknown) => void
  children: () => unknown
}): StreamChunk {
  try {
    return {
      kind: "sequence",
      chunks: [sync(markerHtml(ERROR_BOUNDARY_MARKER)), streamValue(props.children())],
    }
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
    return {
      kind: "sequence",
      chunks: [sync(markerHtml(ERROR_BOUNDARY_MARKER)), streamValue(fb)],
    }
  }
}

/**
 * Suspend：同步内容直接输出；异步内容产出 async chunk——流式 walker 遍历到
 * 此处先 flush 已缓冲的同步骨架、再 await 解析后继续输出真实内容。reject 时
 * 上报错误并渲染 `fallback`。
 */
export function controlSuspend(
  props: { fallback?: unknown; children: unknown },
  hooks?: ControlFlowHooks,
): StreamChunk {
  const children = unwrap(props.children)

  // 异步内容 resolve 时按需重新换入模式运行时（见 ControlFlowHooks）
  const resolveAsync = (value: unknown): Promise<StreamChunk[]> =>
    Promise.resolve(value).then(resolved => {
      const restore = hooks?.reenterRuntime?.()
      try {
        return chunkify(resolved)
      } finally {
        restore?.()
      }
    })
  const resolveWithFallback = (value: unknown): Promise<StreamChunk[]> =>
    resolveAsync(value).catch(rejected => {
      reportError(rejected)
      return resolveAsync(props.fallback)
    })
  if (isPromiseLike(children)) {
    return {
      kind: "sequence",
      chunks: [
        sync(markerHtml(SUSPEND_MARKER)),
        { kind: "async", promise: resolveWithFallback(children) },
        sync(markerHtml(SUSPEND_END_MARKER)),
      ],
    }
  }

  if (Array.isArray(children) && children.some(isPromiseLike)) {
    return {
      kind: "sequence",
      chunks: [
        sync(markerHtml(SUSPEND_MARKER)),
        { kind: "async", promise: resolveWithFallback(Promise.all(children)) },
        sync(markerHtml(SUSPEND_END_MARKER)),
      ],
    }
  }

  return {
    kind: "sequence",
    chunks: [
      sync(markerHtml(SUSPEND_MARKER)),
      streamValue(children),
      sync(markerHtml(SUSPEND_END_MARKER)),
    ],
  }
}

// ---------------------------------------------------------------------------
// 字符串模式 walker：块树 → 完整 HTML（全同步时保持同步）
// ---------------------------------------------------------------------------

/** 全同步 join；含异步块时返回 null（无法同步完成） */
function tryJoinSync(chunk: StreamChunk): string | null {
  switch (chunk.kind) {
    case "empty":
      return ""
    case "sync":
      return chunk.html
    case "async":
      return null
    case "sequence": {
      let out = ""
      for (const child of chunk.chunks) {
        const s = tryJoinSync(child)
        if (s === null) return null
        out += s
      }
      return out
    }
  }
}

/** 字符串模式 walker：把块树完整 join 为 HTML（异步块 resolve 后继续）。 */
export async function chunksToString(chunk: StreamChunk): Promise<string> {
  let out = ""
  const walk = async (c: StreamChunk): Promise<void> => {
    switch (c.kind) {
      case "empty":
        return
      case "sync":
        out += c.html
        return
      case "async":
        for (const r of await c.promise) await walk(r)
        return
      case "sequence":
        for (const child of c.chunks) await walk(child)
        return
    }
  }
  await walk(chunk)
  return out
}

/**
 * 字符串模式的控制流出口：全同步时同步返回 `SSRElement`（与历史行为一致，
 * 不引入多余微任务），含异步块时返回 promise。
 */
export function chunksToSSRValue(chunk: StreamChunk): SSRElement | Promise<SSRElement> {
  const joined = tryJoinSync(chunk)
  if (joined !== null) return new SSRElement(joined)
  return chunksToString(chunk).then(html => new SSRElement(html))
}
