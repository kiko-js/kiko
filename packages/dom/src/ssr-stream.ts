/**
 * 流式 SSR：把组件树渲染为 `ReadableStream<string>`，同步骨架立即 flush，
 * 异步内容（`<Suspend>` 内的 promise）resolve 后再补发——降低 TTFB。
 *
 * 与 `ssr.ts`（`renderToFragment`）的区别：
 * - `renderToFragment` 等待整棵树 resolve 后返回完整字符串
 * - `renderToStream` 同步部分立即输出，异步边界处 await 后继续
 *
 * 实现策略：控制流与叶序列化语义单源于 `ssr-engine.ts`（块树 IR）；本模块
 * 只保留流式模式的元素序列化（`streamJsx` / `streamStyle`，scoped `<Style>`
 * 的结构性限制见下）与增量 walker——`renderToStream` 按文档序遍历块树，
 * 遇到异步叶时先输出已缓冲的同步内容、再 await 解析后继续。
 */
import { extractCssText, isPromiseLike } from "./shared"
import { useSSRRuntime } from "./ssr-mode"
import type { SSRRuntime } from "./ssr-mode"
import {
  controlErrorBoundary,
  controlFor,
  controlShow,
  controlSuspend,
  escapeAttr,
  escapeStyleText,
  streamValue,
  sync,
} from "./ssr-engine"
import type { StreamChunk } from "./ssr-engine"
import { RAW_TEXT_ELEMENTS, VOID_ELEMENTS, guardRawText, serializeAttrs, toRawText } from "./ssr"
import type { AsyncComponent, Component, Props, StyleProps } from "./jsx-runtime"

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
    // 流式块树无法在 opening tag 输出前把 scope 标记回溯到祖先元素(见文件头)。
    // 与其把 scoped css 静默降级为全局(泄漏到整页、污染无关元素),不如丢弃该
    // 样式并明确告警:样式无效果,其余渲染不受影响。需要 scoped style 请用
    // renderToFragment,或用 <Style global> 显式接受全局。
    console.warn(
      `[kiko] scoped <Style> in renderToStream is omitted (no effect): streaming cannot ` +
        `apply scope attributes retroactively. Use <Style global> or renderToFragment ` +
        `for scoped css.`,
    )
    // 保留空 <style> 节点(含 nonce):样式不生效,但维持与 renderToFragment /
    // 水合对齐相同的节点结构,避免流式输出在这里留下空洞错位。
    const nonceAttr = props.nonce ? ` nonce="${escapeAttr(props.nonce)}"` : ""
    return sync(`<style${nonceAttr}></style>`)
  }
  const css = escapeStyleText(extractCssText(props.children))
  const nonceAttr = props.nonce ? ` nonce="${escapeAttr(props.nonce)}"` : ""
  return sync(`<style${nonceAttr}>${css}</style>`)
}

export const ssrStreamRuntime: SSRRuntime = {
  jsx: (tag, props) => streamJsx(tag as string | Component<any>, props as Props | null) as unknown,
  fragment: children => streamValue(children) as unknown,
  style: props => streamStyle(props as StyleProps) as unknown,
  show: props => controlShow(props as Parameters<typeof controlShow>[0]) as unknown,
  for: props => controlFor(props as Parameters<typeof controlFor>[0]) as unknown,
  errorBoundary: props =>
    controlErrorBoundary(props as Parameters<typeof controlErrorBoundary>[0]) as unknown,
  suspend: props =>
    controlSuspend(props as Parameters<typeof controlSuspend>[0], {
      reenterRuntime: () => useSSRRuntime(ssrStreamRuntime),
    }) as unknown,
}

// ---------------------------------------------------------------------------
// 入口：遍历块树并流式输出
// ---------------------------------------------------------------------------

/**
 * 流式渲染：返回 `ReadableStream<string>`，同步骨架立即输出，异步内容
 * resolve 后补发。适用于 HTTP 流式响应（TTFB 低于 `renderToFragment`）。
 *
 * `options.signal`（AbortSignal）：abort 后渲染在下一个 await 边界停止，
 * 流以 `signal.reason` 报错——不做静默截断（半截 HTML 以 200 返回比可见
 * 失败更危险）。已 flush 的片段不回收，由消费方（HTTP 层）自行处理。
 *
 * ```ts
 * const stream = renderToStream(() => <App />, { signal: req.abortSignal })
 * return new Response(stream, { headers: { "content-type": "text/html" } })
 * ```
 */
export function renderToStream(
  component: () => unknown,
  options?: { signal?: AbortSignal },
): ReadableStream<string> {
  const signal = options?.signal
  return new ReadableStream<string>({
    async start(controller) {
      let aborted = false
      let abortPromise: Promise<never> | null = null
      let removeAbortListener: (() => void) | null = null
      // abort 时在通知消费方之前恢复运行时槽（下方 useSSRRuntime 的 restore
      // 幂等，重复调用无害）：错误路径 restore 在 finally 中先于 controller.error
      // 执行，abort 路径对齐这一顺序，否则消费方（HTTP 层）在 abort 后的
      // 后续渲染会拿到残留的流式运行时
      let restoreRuntime: (() => void) | null = null
      if (signal) {
        const reason = (): unknown => signal.reason ?? new Error("renderToStream aborted")
        let rejectAbort!: (r: unknown) => void
        abortPromise = new Promise<never>((_, reject) => {
          rejectAbort = reject
        })
        // 竞速点之外（如渲染全程同步完成）的 rejection 自行消费，避免 unhandled
        abortPromise.catch(() => {})
        const onAbort = (): void => {
          aborted = true
          restoreRuntime?.()
          try {
            controller.error(reason())
          } catch {
            // 流已关闭或已出错——中止无需再报
          }
          rejectAbort(reason())
        }
        if (signal.aborted) onAbort()
        else {
          signal.addEventListener("abort", onAbort, { once: true })
          removeAbortListener = () => signal.removeEventListener("abort", onAbort)
        }
      }
      if (aborted) return
      const race = <T>(p: PromiseLike<T>): Promise<T> =>
        abortPromise ? Promise.race([p, abortPromise]) : Promise.resolve(p)
      const ctx: StreamContext = {
        emit(chunk: string) {
          if (chunk && !aborted) controller.enqueue(chunk)
        },
      }
      try {
        // 临时切换为流式运行时,让 JSX 求值构建块树
        restoreRuntime = useSSRRuntime(ssrStreamRuntime)
        try {
          const result = component()
          const root = isPromiseLike(result)
            ? await race(result.then(r => streamValue(r)))
            : streamValue(result)
          await flushChunks(root, ctx, race)
          if (!aborted) controller.close()
        } finally {
          restoreRuntime()
        }
      } catch (e) {
        if (!aborted) controller.error(e)
      } finally {
        removeAbortListener?.()
      }
    },
  })
}

/** 流式输出上下文 */
export interface StreamContext {
  emit(chunk: string): void
}

/**
 * 按文档序遍历块树，同步叶立即输出，异步叶 await 后继续。
 * `race`（renderToStream 注入）把每个 await 点挂在 abort 竞速上，使中止
 * 能在下一个边界打断渲染，而不是无限等待挂死的 promise。
 */
async function flushChunks(
  chunk: StreamChunk,
  ctx: StreamContext,
  race?: <T>(p: PromiseLike<T>) => Promise<T>,
): Promise<void> {
  switch (chunk.kind) {
    case "empty":
      return
    case "sync":
      ctx.emit(chunk.html)
      return
    case "async": {
      const resolved = await (race ? race(chunk.promise) : chunk.promise)
      for (const r of resolved) await flushChunks(r, ctx, race)
      return
    }
    case "sequence":
      for (const child of chunk.chunks) await flushChunks(child, ctx, race)
      return
  }
}
