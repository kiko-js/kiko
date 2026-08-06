import { isSignal } from "./signal"
import type { WatchableSignal } from "./signal"
import { createScopeAttr, rewriteScopedCss } from "./style"
import type { AsyncComponent, Component, Props, StyleProps } from "./jsx-runtime"

/**
 * SSR 字符串渲染器。
 *
 * kiko 的组件函数是唯一事实来源（无 vdom），因此 SSR 不做第二套渲染管线：用
 * 模块级深度计数器把 `jsx` / 控制流组件切到字符串模式，让同一套组件代码产出
 * HTML。`beginSSR` / `endSSR` 配对成深度计数而非布尔值——两个并发 SSR 渲染的
 * await 间隙不会把对方踢出 SSR 模式（客户端渲染全程同步，天然不与 SSR 交错）。
 *
 * SSR 模式下 `jsx` 返回 `string | Promise<string>`（children 含 promise 时异步），
 * 组件返回的 Promise 逐层向上传播，入口处整体 await。
 */

/**
 * 已序列化的 HTML 标记（区别于需要转义的纯文本字符串）。
 * ssrJsx / 控制流组件返回它；toSSRString 直接透出 `.html` 不再转义，
 * 而普通字符串仍按文本转义——避免嵌套组件的结果被二次转义。
 */
class SSRElement {
  constructor(readonly html: string) {}
}

/** SSR 渲染值：文本（转义）或已序列化标记（透出），可含 promise */
export type SSRValue = SSRElement | string | Promise<SSRElement | string>

let ssrDepth = 0

export function isSSR(): boolean {
  return ssrDepth > 0
}

export function beginSSR(): void {
  ssrDepth++
}

export function endSSR(): void {
  ssrDepth--
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function"
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function raw(value: SSRElement | string): string {
  return value instanceof SSRElement ? value.html : value
}

function camelToKebab(key: string): string {
  return /[A-Z]/.test(key) ? key.replace(/[A-Z]/g, m => "-" + m.toLowerCase()) : key
}

/**
 * 把任意内容序列化为 HTML 字符串：
 * - 信号 → 读取当前快照（SSR 无响应式）
 * - promise → 异步，resolve 后继续序列化
 * - 数组 → 逐项拼接；含 promise 时整体异步
 * - 文本转义 & < >
 */
export function toSSRString(value: unknown): SSRValue {
  if (value == null || value === false || value === true) return ""
  if (value instanceof SSRElement) return value
  if (isSignal(value)) return toSSRString((value as WatchableSignal<unknown>).get())
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
// scoped <Style>：scope 属性挂在“最近元素祖先”上。children 先于父元素求值，
// Style 运行时把 scope 属性压入待定队列；下一个开始序列化的元素（即其父元素）
// 取走队列——嵌套时先序列化的内层元素会先取走，正好是“最近祖先”语义。
let pendingScopes: string[] = []

function takePendingScopes(): string[] {
  const scopes = pendingScopes
  pendingScopes = []
  return scopes
}

function extractCssText(children: unknown): string {
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

export function ssrStyle(props: StyleProps): SSRValue {
  const css = extractCssText(props.children)
  if (props.global) {
    return new SSRElement(`<style>${css}</style>`)
  }
  const attr = createScopeAttr()
  pendingScopes.push(attr)
  return new SSRElement(`<style>${rewriteScopedCss(css, attr)}</style>`)
}

// ---------------------------------------------------------------------------
// 元素 / 组件

const VOID_ELEMENTS = new Set([
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

function serializeAttrs(props: Record<string, unknown>): string {
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

  const pending = takePendingScopes()
  const attrs = serializeAttrs(p) + pending.map(a => ` ${a}`).join("")

  if (VOID_ELEMENTS.has(tag)) {
    return new SSRElement(`<${tag}${attrs}>`)
  }

  const children = toSSRString(p.children)
  const close = `</${tag}>`
  if (isPromiseLike(children)) {
    return children.then(c => new SSRElement(`<${tag}${attrs}>${raw(c)}${close}`))
  }
  return new SSRElement(`<${tag}${attrs}>${raw(children)}${close}`)
}

// ---------------------------------------------------------------------------
// 控制流组件（与 flow.ts 客户端路径共享同一 props 语义）

function unwrap<T>(value: T | WatchableSignal<T>): T {
  return isSignal(value) ? (value as WatchableSignal<T>).get() : (value as T)
}

function isTruthy(cond: unknown): boolean {
  return cond !== false && cond != null && cond !== "" && cond !== 0
}

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
    return value as unknown as SSRValue
  }
  return props.fallback as unknown as SSRValue
}

export function ssrFor(props: {
  each: unknown
  getKey?: (item: unknown, index: number) => unknown
  children: (item: unknown, index: () => number) => unknown
}): SSRValue {
  const list = unwrap(props.each) as readonly unknown[]
  // SSR 无响应式：keyed 与 non-keyed 等价；keyed 的 children 期望 accessor，保持一致
  return list.map((item, i) => {
    const index = (): number => i
    const arg = props.getKey ? () => item : item
    return props.children(arg, index)
  }) as unknown as SSRValue
}

export function ssrErrorBoundary(props: {
  fallback?: unknown | ((error: unknown) => unknown)
  onError?: (error: unknown) => void
  children: () => unknown
}): SSRValue {
  try {
    return props.children() as unknown as SSRValue
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
    return fb as unknown as SSRValue
  }
}

function reportErrorSSR(error: unknown): void {
  if (typeof reportError === "function") reportError(error)
}

export function ssrSuspend(props: { fallback?: unknown; children: unknown }): SSRValue {
  const children = unwrap(props.children)
  if (isPromiseLike(children)) {
    return Promise.resolve(children).then(
      resolved => resolved as unknown as SSRValue,
      rejected => {
        reportErrorSSR(rejected)
        return props.fallback as unknown as SSRValue
      },
    )
  }
  if (Array.isArray(children) && children.some(isPromiseLike)) {
    return Promise.all(children).then(
      resolved => resolved as unknown as SSRValue,
      rejected => {
        reportErrorSSR(rejected)
        return props.fallback as unknown as SSRValue
      },
    )
  }
  return children as unknown as SSRValue
}

// ---------------------------------------------------------------------------
// 入口：两种形式

/**
 * 服务端渲染完整文档：以 `<html>` 为根，自动前置 `<!DOCTYPE html>`。
 * 必须传函数（惰性求值）——JSX 会在 SSR 模式开启前被急切求值：
 * `renderToDocument(() => <App />)`。
 */
export async function renderToDocument(component: () => unknown): Promise<string> {
  beginSSR()
  try {
    pendingScopes = []
    const result = await toSSRString(component())
    return `<!DOCTYPE html>${raw(result)}`
  } finally {
    endSSR()
  }
}

/**
 * 服务端渲染片段：任意子树，不带 doctype。
 * `renderToFragment(() => <CardList />)`。
 */
export async function renderToFragment(component: () => unknown): Promise<string> {
  beginSSR()
  try {
    pendingScopes = []
    return raw(await toSSRString(component()))
  } finally {
    endSSR()
  }
}
