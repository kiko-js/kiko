import { isSignal, reportError } from "./signal"
import type { WatchableSignal } from "./signal"
import { createScopeAttr, rewriteScopedCss } from "./style"
import { extractCssText, isPromiseLike, isTruthy, unwrap } from "./shared"
import type { SSRRuntime } from "./ssr-mode"
import type { AsyncComponent, Component, Props, StyleProps } from "./jsx-runtime"

/**
 * SSR 字符串渲染器（服务端侧）。
 *
 * kiko 的组件函数是唯一事实来源（无 vdom），因此 SSR 不做第二套渲染管线：本模块
 * 实现字符串模式的 jsx / 控制流组件，并在模块加载时通过 `ssr-mode` 自注册——
 * `jsx-runtime` / `flow` 检测到已注册的运行时即切换为字符串产出。
 *
 * 该模块只被 `@kikojs/dom/server` 入口引用；客户端 bundle 从不导入它，
 * 因此可被 tree-shake 完全剔除。
 *
 * SSR 模式下 `jsx` 返回 `string | Promise<string>`（children 含 promise 时异步），
 * 组件返回的 Promise 逐层向上传播，入口处整体 await。输出中的注释节点
 * （`<!--show-->`、`<!---->` 等）是水合对齐标记，不影响渲染。
 */

/**
 * 已序列化的 HTML 标记（区别于需要转义的纯文本字符串）。
 * ssrJsx / 控制流组件返回它；toSSRString 直接透出 `.html` 不再转义，
 * 而普通字符串仍按文本转义——避免嵌套组件的结果被二次转义。
 */
/** 已序列化的 HTML 标记（区别于需要转义的纯文本字符串） */
export class SSRElement {
  constructor(readonly html: string) {}
}

/** SSR 渲染值：文本（转义）或已序列化标记（透出），可含 promise */
export type SSRValue = SSRElement | string | Promise<SSRElement | string>

/** @internal exported for ssr-stream */
export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** @internal exported for ssr-stream */
export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function raw(value: SSRElement | string): string {
  return value instanceof SSRElement ? value.html : value
}

/** @internal exported for ssr-stream */
export function camelToKebab(key: string): string {
  return /[A-Z]/.test(key) ? key.replace(/[A-Z]/g, m => "-" + m.toLowerCase()) : key
}

/** 序列化结果前置水合标记（如 <!--show-->），包装为 SSRElement 避免上游二次转义 */
function withMarker(marker: string, content: SSRValue): SSRValue {
  if (isPromiseLike(content)) {
    return content.then(c => new SSRElement(`${marker}${raw(c)}`))
  }
  return new SSRElement(`${marker}${raw(content)}`)
}

/**
 * 把任意内容序列化为 HTML 字符串：
 * - 信号 → 输出水合标记 `<!---->` + 当前快照（SSR 无响应式）
 * - promise → 异步，resolve 后继续序列化
 * - 数组 → 逐项拼接；含 promise 时整体异步
 * - 文本转义 & < >
 */
export function toSSRString(value: unknown): SSRValue {
  if (value == null || value === false || value === true) return ""
  if (value instanceof SSRElement) return value
  if (isSignal(value)) {
    return withMarker("<!---->", toSSRString((value as WatchableSignal<unknown>).get()))
  }
  if (isPromiseLike(value)) {
    return Promise.resolve(value).then(resolved => toSSRString(resolved))
  }
  if (typeof value === "string" || typeof value === "number") return escapeText(String(value))
  if (Array.isArray(value)) {
    const parts = value.map(item => toSSRString(item))
    if (parts.some(isPromiseLike)) {
      return Promise.all(parts).then(joined => new SSRElement(joined.map(raw).join("")))
    }
    return new SSRElement((parts as (SSRElement | string)[]).map(raw).join(""))
  }
  return escapeText(String(value))
}

// ---------------------------------------------------------------------------
// scoped <Style>：scope 属性挂在“包含该 style 的元素”上（与客户端 appendChild
// 时 applyScopeRoots 挂父元素的语义一致）。children 先于父元素求值，且兄弟元素
// 也在父之前序列化，所以序列化顺序队列（pendingScopes）会被兄弟抢先消费——
// scope 会错误地落到兄弟元素上。改为：ssrStyle 在输出中内嵌唯一标记
// `<!--kiko-scope:attr-->`，每个元素序列化完 children 后提取自己 children 里的
// 标记挂到自身 attrs；最内层包含元素消费后，标记不再外泄。

const SCOPE_MARKER_PREFIX = "<!--kiko-scope:"
const SCOPE_MARKER_SUFFIX = "-->"

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

/** @internal exported for ssr-stream */
export function escapeStyleText(css: string): string {
  // Prevent `</style>` in CSS from closing the element early and enabling
  // markup injection. The backslash keeps the HTML parser from seeing a tag
  // while remaining valid CSS text for the common breaking sequence.
  return css.replace(/<\/style/gi, "<\\/style")
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
    `<!--kiko-scope:${attr}--><style${nonceAttr}>${rewriteScopedCss(css, attr)}</style>`,
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

function serializeAttr(key: string, value: unknown): string {
  if (value == null || value === false) return ""
  if (key === "className") key = "class"
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
// 控制流组件（与 flow.ts 客户端路径共享同一 props 语义）

export function ssrShow(props: {
  when: unknown
  fallback?: unknown
  children: unknown | ((value: unknown) => unknown)
}): SSRValue {
  const cond = unwrap(props.when)
  if (isTruthy(cond)) {
    const value =
      typeof props.children === "function"
        ? (props.children as (value: unknown) => unknown)(cond)
        : props.children
    return withMarker("<!--show-->", toSSRString(value))
  }
  return withMarker("<!--show-->", toSSRString(props.fallback))
}

export function ssrFor(props: {
  each: unknown
  getKey?: (item: unknown, index: number) => unknown
  children: (item: unknown, index: () => number) => unknown
}): SSRValue {
  const list = unwrap(props.each) as readonly unknown[]
  // SSR 无响应式：keyed 与 non-keyed 等价；keyed 的 children 期望 accessor，保持一致
  const content = list.map((item, i) => {
    const index = (): number => i
    const arg = props.getKey ? () => item : item
    return props.children(arg, index)
  })
  return withMarker("<!--for-->", toSSRString(content))
}

export function ssrErrorBoundary(props: {
  fallback?: unknown | ((error: unknown) => unknown)
  onError?: (error: unknown) => void
  children: () => unknown
}): SSRValue {
  try {
    return withMarker("<!--error-boundary-->", toSSRString(props.children()))
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
    return withMarker("<!--error-boundary-->", toSSRString(fb))
  }
}

export function ssrSuspend(props: { fallback?: unknown; children: unknown }): SSRValue {
  const wrap = (content: SSRValue): SSRValue => {
    if (isPromiseLike(content)) {
      return Promise.resolve(content).then(
        c => new SSRElement(`<!--suspend-->${raw(c)}<!--/suspend-->`),
        rejected => {
          reportError(rejected)
          return Promise.resolve(toSSRString(props.fallback)).then(
            c => new SSRElement(`<!--suspend-->${raw(c)}<!--/suspend-->`),
          )
        },
      )
    }
    return new SSRElement(`<!--suspend-->${raw(content)}<!--/suspend-->`)
  }

  const children = unwrap(props.children)
  if (isPromiseLike(children)) {
    return wrap(Promise.resolve(children).then(resolved => toSSRString(resolved)))
  }
  if (Array.isArray(children) && children.some(isPromiseLike)) {
    return wrap(Promise.all(children).then(resolved => toSSRString(resolved)))
  }
  return wrap(toSSRString(children))
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
