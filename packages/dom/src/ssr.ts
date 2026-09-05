import { SCOPE_MARKER_PREFIX, SCOPE_MARKER_SUFFIX } from "./markers"
import { isSignal } from "./signal"
import type { WatchableSignal } from "./signal"
import { createScopeAttr, rewriteScopedCss } from "./style"
import { extractCssText, isPromiseLike } from "./shared"
import {
  SSRElement,
  camelToKebab,
  chunksToSSRValue,
  controlErrorBoundary,
  controlFor,
  controlShow,
  controlSuspend,
  escapeAttr,
  escapeStyleText,
  streamValue,
} from "./ssr-engine"
import type { SSRRuntime } from "./ssr-mode"
import type { AsyncComponent, Component, Props, StyleProps } from "./jsx-runtime"

/**
 * SSR 字符串渲染器（服务端侧）。
 *
 * kiko 的组件函数是唯一事实来源（无 vdom），因此 SSR 不做第二套渲染管线：
 * 控制流与叶序列化语义单源于 `ssr-engine.ts`（块树 IR），本模块是字符串
 * 模式的元素序列化（含 scoped `<Style>` 的 opening tag 回溯）与全量 join
 * walker，并通过 `ssrRuntime` 供 `server.ts` 注册到 `ssr-mode`。
 *
 * 该模块只被 `@kikojs/dom/server` 入口引用；客户端 bundle 从不导入它，
 * 因此可被 tree-shake 完全剔除。
 *
 * SSR 模式下 `jsx` 返回 `string | Promise<string>`（children 含 promise 时异步），
 * 组件返回的 Promise 逐层向上传播，入口处整体 await。输出中的注释节点
 * （`<!--show-->`、`<!---->` 等）是水合对齐标记，不影响渲染。
 */

/** SSR 渲染值：文本（转义）或已序列化标记（透出），可含 promise */
export type SSRValue = SSRElement | string | Promise<SSRElement | string>

function raw(value: SSRElement | string): string {
  return value instanceof SSRElement ? value.html : value
}

/**
 * 把任意内容序列化为 HTML 字符串：信号 → 水合标记 + 快照；promise → 异步；
 * 数组 → 逐项拼接。委托共享引擎的叶序列化（`streamValue`）后全量 join。
 */
export function toSSRString(value: unknown): SSRValue {
  return chunksToSSRValue(streamValue(value))
}

// ---------------------------------------------------------------------------
// scoped <Style>：scope 属性挂在“包含该 style 的元素”上（与客户端 appendChild
// 时 applyScopeRoots 挂父元素的语义一致）。children 先于父元素求值，且兄弟元素
// 也在父之前序列化，所以序列化顺序队列（pendingScopes）会被兄弟抢先消费——
// scope 会错误地落到兄弟元素上。改为：ssrStyle 在输出中内嵌唯一标记
// `<!--kiko-scope:attr-->`，每个元素序列化完 children 后提取自己 children 里的
// 标记挂到自身 attrs；最内层包含元素消费后，标记不再外泄。

function extractScopeMarkers(html: string): { cleaned: string; attrs: string[] } {
  const attrs: string[] = []
  const parts: string[] = []
  let pos = 0
  while (true) {
    const idx = html.indexOf(SCOPE_MARKER_PREFIX, pos)
    if (idx < 0) {
      parts.push(html.slice(pos))
      break
    }
    const end = html.indexOf(SCOPE_MARKER_SUFFIX, idx + SCOPE_MARKER_PREFIX.length)
    if (end < 0) {
      parts.push(html.slice(pos))
      break
    }
    attrs.push(html.slice(idx + SCOPE_MARKER_PREFIX.length, end))
    parts.push(html.slice(pos, idx))
    pos = end + SCOPE_MARKER_SUFFIX.length
  }
  return { cleaned: parts.join(""), attrs }
}

export function ssrStyle(props: StyleProps): SSRValue {
  const css = escapeStyleText(extractCssText(props.children))
  const nonceAttr = props.nonce ? ` nonce="${escapeAttr(props.nonce)}"` : ""
  if (props.global) {
    return new SSRElement(`<style${nonceAttr}>${css}</style>`)
  }
  const attr = createScopeAttr()
  // 标记由最近的序列化祖先元素（即包含该 style 的元素）提取并挂载
  return new SSRElement(
    `${SCOPE_MARKER_PREFIX}${attr}${SCOPE_MARKER_SUFFIX}<style${nonceAttr}>${rewriteScopedCss(css, attr)}</style>`,
  )
}

// ---------------------------------------------------------------------------
// 元素 / 组件

/** @internal exported for ssr-stream */
export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

// RAW TEXT 元素：HTML 解析器把内容当纯文本，字符引用（&lt;）不会被解码，
// 所以普通文本转义会破坏内容（如 <script> 里的 JS 会变成字面 "&lt;"）。
// 这些元素的内容按原样序列化，只防御把自身结束标签写进内容的注入。
/** @internal exported for ssr-stream */
export const RAW_TEXT_ELEMENTS = new Set([
  "script",
  "noscript",
  "iframe",
  "xmp",
  "noembed",
  "noframes",
])

/**
 * raw-text 元素的内容序列化：逐叶取 String，不做 HTML 转义。
 * 信号取快照，数组逐项拼接，含 promise 时整体异步。
 */
/** @internal exported for ssr-stream */
export function toRawText(value: unknown): unknown {
  if (value == null || value === false || value === true) return ""
  if (value instanceof SSRElement) return value.html // 已是序列化标记（如子元素）
  if (isSignal(value)) return toRawText((value as WatchableSignal<unknown>).get())
  if (isPromiseLike(value)) return Promise.resolve(value).then(resolved => toRawText(resolved))
  if (Array.isArray(value)) {
    const parts = value.map(item => toRawText(item))
    if (parts.some(isPromiseLike)) {
      return Promise.all(parts).then(joined => (joined as string[]).join(""))
    }
    return (parts as string[]).join("")
  }
  return String(value)
}

/** @internal exported for ssr-stream */
export function guardRawText(text: string, tag: string): string {
  // "<\/tag"：反斜杠是合法转义，HTML 解析器也看不到闭合标签。
  return text.replace(new RegExp("</" + tag, "gi"), "<\\/" + tag)
}

/** 合法属性名。值有 escapeAttr 防护，名字却直接拼进输出——外部数据
 * spread 进 props 时恶意键名可注入标签（如 `x"><script>…`），序列化前校验。
 * 覆盖 data-* / aria-* / xlink:href / xml:lang 等；非法名丢弃并告警。 */
const ATTR_NAME_PATTERN = /^[a-zA-Z_:@][a-zA-Z0-9_:.-]*$/

function serializeAttr(key: string, value: unknown): string {
  if (value == null || value === false) return ""
  if (!ATTR_NAME_PATTERN.test(key)) {
    console.warn(`[kiko ssr] dropped invalid attribute name ${JSON.stringify(key)}`)
    return ""
  }
  if (key === "style" && value && typeof value === "object" && !Array.isArray(value)) {
    const src = value as Record<string, string>
    const css = Object.entries(src)
      .map(([prop, v]) => `${camelToKebab(prop)}: ${v}`)
      .join("; ")
    return ` style="${escapeAttr(css)}"`
  }
  if (value === true) return ` ${key}`
  return ` ${key}="${escapeAttr(String(value))}"`
}

/** @internal exported for ssr-stream */
export function serializeAttrs(props: Record<string, unknown>): string {
  let out = ""
  for (const key of Object.keys(props)) {
    if (key === "children" || key === "key" || key === "ref") continue
    if (key.startsWith("on")) continue // 事件处理器无法序列化，丢弃
    const attrValue = props[key]
    if (isSignal(attrValue)) {
      out += serializeAttr(key, (attrValue as WatchableSignal<unknown>).get())
      continue
    }
    out += serializeAttr(key, attrValue)
  }
  return out
}

/** SSR 模式的 jsx：组件直接调用（返回 string | Promise<string>），元素拼字符串 */
export function ssrJsx(
  tag: string | Component<any> | AsyncComponent<any>,
  props: Props | null,
): SSRValue {
  const p = props ?? ({} as Props)

  if (typeof tag === "function") {
    // 客户端类型签名是 Node，SSR 模式下实际为字符串
    return tag(p) as unknown as SSRValue
  }

  if (tag === "style") return ssrStyle(p as StyleProps)

  if (VOID_ELEMENTS.has(tag)) {
    return new SSRElement(`<${tag}${serializeAttrs(p)}>`)
  }

  // RAW TEXT 元素：内容不转义（见 toRawText），只防结束标签注入。
  if (RAW_TEXT_ELEMENTS.has(tag)) {
    const close = `</${tag}>`
    const content = toRawText(p.children)
    if (isPromiseLike(content)) {
      return Promise.resolve(content).then(
        c =>
          new SSRElement(`<${tag}${serializeAttrs(p)}>${guardRawText(c as string, tag)}${close}`),
      )
    }
    return new SSRElement(
      `<${tag}${serializeAttrs(p)}>${guardRawText(content as string, tag)}${close}`,
    )
  }

  // children 先序列化：其中 <Style> 的 scope 标记由当前元素提取并挂到自身 attrs
  const children = toSSRString(p.children)
  const close = `</${tag}>`
  if (isPromiseLike(children)) {
    return children.then(c => {
      const { cleaned, attrs } = extractScopeMarkers(raw(c))
      const scopeAttrs = attrs.length > 0 ? ` ${attrs.join(" ")}` : ""
      return new SSRElement(`<${tag}${serializeAttrs(p)}${scopeAttrs}>${cleaned}${close}`)
    })
  }
  const { cleaned, attrs } = extractScopeMarkers(raw(children))
  const scopeAttrs = attrs.length > 0 ? ` ${attrs.join(" ")}` : ""
  return new SSRElement(`<${tag}${serializeAttrs(p)}${scopeAttrs}>${cleaned}${close}`)
}

// ---------------------------------------------------------------------------
// 控制流组件（语义单源于 ssr-engine.ts；这里只是字符串模式的出口包装）

export function ssrShow(props: Parameters<typeof controlShow>[0]): SSRValue {
  return chunksToSSRValue(controlShow(props))
}

export function ssrFor(props: Parameters<typeof controlFor>[0]): SSRValue {
  return chunksToSSRValue(controlFor(props))
}

export function ssrErrorBoundary(props: Parameters<typeof controlErrorBoundary>[0]): SSRValue {
  return chunksToSSRValue(controlErrorBoundary(props))
}

export function ssrSuspend(props: Parameters<typeof controlSuspend>[0]): SSRValue {
  return chunksToSSRValue(controlSuspend(props))
}

// ---------------------------------------------------------------------------
// 运行时（由 server.ts 显式注册；不在模块加载时自注册，避免全局副作用）

/** SSR 字符串运行时：jsx / 控制流组件在 SSR 模式下的实现集合 */
export const ssrRuntime: SSRRuntime = {
  jsx: ssrJsx,
  fragment: children => toSSRString(children),
  style: ssrStyle,
  show: ssrShow,
  for: ssrFor,
  errorBoundary: ssrErrorBoundary,
  suspend: ssrSuspend,
}

/**
 * 服务端渲染片段：任意子树，不带 doctype。
 * `renderToFragment(() => <CardList />)`。
 */
export async function renderToFragment(component: () => unknown): Promise<string> {
  const result = await toSSRString(component())
  const { cleaned, attrs } = extractScopeMarkers(raw(result))
  if (attrs.length > 0) {
    console.warn(
      `[kiko] <Style> at fragment root has no ancestor element to scope; ` +
        `scoped CSS won't apply. Wrap <Style> in an element or use <Style global>.`,
    )
  }
  return cleaned
}
