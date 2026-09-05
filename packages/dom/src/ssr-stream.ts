import {
  ERROR_BOUNDARY_MARKER,
  FOR_MARKER,
  SHOW_MARKER,
  SIGNAL_MARKER_HTML,
  SUSPEND_END_MARKER,
  SUSPEND_MARKER,
  markerHtml,
} from "./markers"
/**
 * 流式 SSR：把组件树渲染为 `ReadableStream<string>`，同步骨架立即 flush，
 * 异步内容（`<Suspend>` 内的 promise）resolve 后再补发——降低 TTFB。
 *
 * 与 `ssr.ts`（`renderToFragment`）的区别：
 * - `renderToFragment` 等待整棵树 resolve 后返回完整字符串
 * - `renderToStream` 同步部分立即输出，异步边界处 await 后继续
 *
 * 实现策略：流式运行时构建一棵「块树」（`StreamChunk`），同步叶立即输出，
 * 异步叶（promise）挂起——`renderToStream` 按文档序遍历块树，遇到异步
 * 叶时先输出已缓冲的同步内容、再 await 解析后继续。
 *
 * 已知限制：
 * - `<style>` 在流式模式下输出为全局样式（不生成 scope 属性）。scope 属性需要
 *   在输出 opening tag 前从 children 提取标记，块树模式下 opening tag 与
 *   子树是兄弟节点、无法回溯。需要 scoped style 时请用 `renderToFragment`。
 */

import { isSignal } from "./signal"
import type { WatchableSignal } from "./signal"
import { extractCssText, isPromiseLike, isTruthy, unwrap } from "./shared"
import { getSSRRuntime, setSSRRuntime } from "./ssr-mode"
import type { SSRRuntime } from "./ssr-mode"
import {
  escapeText,
  escapeAttr,
  serializeAttrs,
  escapeStyleText,
  toRawText,
  guardRawText,
  SSRElement,
  VOID_ELEMENTS,
  RAW_TEXT_ELEMENTS,
} from "./ssr"
import type { AsyncComponent, Component, Props, StyleProps } from "./jsx-runtime"

// ---------------------------------------------------------------------------
// 块树：流式渲染的中间表示
// ---------------------------------------------------------------------------

/** 同步 HTML 片段（可立即输出） */
type SyncChunk = { kind: "sync"; html: string }
/** 异步块：promise resolve 后产出子块树 */
type AsyncChunk = { kind: "async"; promise: Promise<StreamChunk[]> }
/** 子块序列（保持文档序） */
type SequenceChunk = { kind: "sequence"; chunks: StreamChunk[] }
/** 空块（null/false/void 等） */
type EmptyChunk = { kind: "empty" }

export type StreamChunk = SyncChunk | AsyncChunk | SequenceChunk | EmptyChunk

/** 同步块工厂 */
function sync(html: string): SyncChunk {
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
function streamValue(value: unknown): StreamChunk {
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
// 元素 / 组件 → 块树
// ---------------------------------------------------------------------------

function streamJsx(
  tag: string | Component<any> | AsyncComponent<any>,
  props: Props | null,
): StreamChunk {
  const p = props ?? ({} as Props)

  if (typeof tag === "function") {
    const result = tag(p)
    return streamValue(result)
  }

  if (tag === "style") return streamStyle(p as StyleProps)

  if (VOID_ELEMENTS.has(tag)) {
    return sync(`<${tag}${serializeAttrs(p)}>`)
  }

  if (RAW_TEXT_ELEMENTS.has(tag)) {
    const content = toRawText(p.children)
    if (isPromiseLike(content)) {
      return {
        kind: "async",
        promise: Promise.resolve(content).then(c => [
          sync(`<${tag}${serializeAttrs(p)}>${guardRawText(c as string, tag)}</${tag}>`),
        ]),
      }
    }
    return sync(`<${tag}${serializeAttrs(p)}>${guardRawText(content as string, tag)}</${tag}>`)
  }

  return {
    kind: "sequence",
    chunks: [sync(`<${tag}${serializeAttrs(p)}>`), streamValue(p.children), sync(`</${tag}>`)],
  }
}

// ---------------------------------------------------------------------------
// <Style>：流式模式下输出为全局样式（见文件头说明）
// ---------------------------------------------------------------------------

function streamStyle(props: StyleProps): StreamChunk {
  if (!props.global) {
    // 与 renderToFragment 的根级警告同类:流式输出无法回溯兄弟树,scope 属性
    // 落不到元素上,scoped CSS 会静默降级为全局样式
    console.warn(
      `[kiko] <Style> in renderToStream emits global CSS (scope attributes cannot ` +
        `be applied retroactively in streaming mode). Use <Style global> to acknowledge.`,
    )
  }
  const css = escapeStyleText(extractCssText(props.children))
  const nonceAttr = props.nonce ? ` nonce="${escapeAttr(props.nonce)}"` : ""
  return sync(`<style${nonceAttr}>${css}</style>`)
}

// ---------------------------------------------------------------------------
// 控制流组件 → 块树
// ---------------------------------------------------------------------------

function streamShow(props: {
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

function streamFor(props: {
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

function streamErrorBoundary(props: {
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
    return { kind: "sequence", chunks: [sync(markerHtml(ERROR_BOUNDARY_MARKER)), streamValue(fb)] }
  }
}

/**
 * 流式 Suspend：同步内容直接输出；异步内容产出 async chunk——
 * `renderToStream` 遍历到此时先 flush 已缓冲的同步骨架、再 await 解析后
 * 继续输出真实内容。
 */
function streamSuspend(props: { fallback?: unknown; children: unknown }): StreamChunk {
  const children = unwrap(props.children)

  // 异步内容 resolve 时，需要重新切回流式运行时，让 JSX 求值产出块树而非 DOM 节点
  const resolveAsync = (value: unknown): Promise<StreamChunk[]> =>
    Promise.resolve(value).then(resolved => {
      const prev = getSSRRuntime()
      setSSRRuntime(ssrStreamRuntime)
      try {
        return chunkify(resolved)
      } finally {
        setSSRRuntime(prev)
      }
    })
  if (isPromiseLike(children)) {
    return {
      kind: "sequence",
      chunks: [
        sync(markerHtml(SUSPEND_MARKER)),
        { kind: "async", promise: resolveAsync(children) },
        sync(markerHtml(SUSPEND_END_MARKER)),
      ],
    }
  }

  if (Array.isArray(children) && children.some(isPromiseLike)) {
    return {
      kind: "sequence",
      chunks: [
        sync(markerHtml(SUSPEND_MARKER)),
        { kind: "async", promise: Promise.all(children).then(resolved => chunkify(resolved)) },
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
// 运行时
// ---------------------------------------------------------------------------

export const ssrStreamRuntime: SSRRuntime = {
  jsx: (tag, props) => streamJsx(tag as string | Component<any>, props as Props | null) as unknown,
  fragment: children => streamValue(children) as unknown,
  style: props => streamStyle(props as StyleProps) as unknown,
  show: props => streamShow(props as Parameters<typeof streamShow>[0]) as unknown,
  for: props => streamFor(props as Parameters<typeof streamFor>[0]) as unknown,
  errorBoundary: props =>
    streamErrorBoundary(props as Parameters<typeof streamErrorBoundary>[0]) as unknown,
  suspend: props => streamSuspend(props as Parameters<typeof streamSuspend>[0]) as unknown,
}

// ---------------------------------------------------------------------------
// 入口：遍历块树并流式输出
// ---------------------------------------------------------------------------

/**
 * 流式渲染：返回 `ReadableStream<string>`，同步骨架立即输出，异步内容
 * resolve 后补发。适用于 HTTP 流式响应（TTFB 低于 `renderToFragment`）。
 *
 * ```ts
 * const stream = renderToStream(() => <App />)
 * return new Response(stream, { headers: { "content-type": "text/html" } })
 * ```
 */
export function renderToStream(component: () => unknown): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      const ctx: StreamContext = {
        emit(chunk: string) {
          if (chunk) controller.enqueue(chunk)
        },
      }
      try {
        // 临时切换为流式运行时，让 JSX 求值构建块树
        const prev = getSSRRuntime()
        setSSRRuntime(ssrStreamRuntime)
        let root: StreamChunk
        try {
          const result = component()
          root = isPromiseLike(result)
            ? await result.then(r => streamValue(r))
            : streamValue(result)
        } finally {
          setSSRRuntime(prev)
        }
        await flushChunks(root, ctx)
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}

/** 流式输出上下文 */
export interface StreamContext {
  emit(chunk: string): void
}

/** 按文档序遍历块树，同步叶立即输出，异步叶 await 后继续 */
async function flushChunks(chunk: StreamChunk, ctx: StreamContext): Promise<void> {
  switch (chunk.kind) {
    case "empty":
      return
    case "sync":
      ctx.emit(chunk.html)
      return
    case "async": {
      const resolved = await chunk.promise
      for (const r of resolved) await flushChunks(r, ctx)
      return
    }
    case "sequence":
      for (const child of chunk.chunks) await flushChunks(child, ctx)
      return
  }
}
