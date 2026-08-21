import { Signal } from "signal-polyfill"
import { createWatcher, isSignal, reportError, watchSignal } from "./signal"
import type { WatchableSignal, Watcher } from "./signal"
import {
  createScopeAttr,
  createSheet,
  rewriteScopedCss,
  supportsConstructable,
  adoptSheet,
  unadoptSheet,
} from "./style"
import { isPromiseLike } from "./shared"
import { getSSRRuntime } from "./ssr-mode"
import { hydrateFragment, hydrateJsx, hydrateStyle, isHydrating } from "./hydrate"

export type Props = Record<string, unknown> & { children?: unknown }
export type Component<P = Props> = (props: P) => Node
export type AsyncComponent<P = Props> = (props?: P) => Promise<Node>

export type { JSX } from "./jsx-types"

// Track watchers per node for cleanup
const nodeWatchers = new WeakMap<Node, Set<Watcher>>()
// Track arbitrary cleanup callbacks per node (e.g. React root unmount)
const nodeCleanups = new WeakMap<Node, Set<() => void>>()
// Sheets owned by scoped-style anchors, so a re-inserted anchor (Show/For
// remount after cleanup) re-adopts its sheet instead of silently losing css.
const scopeSheets = new WeakMap<Node, CSSStyleSheet>()
// Accounting set so `isAdopted` is O(1) instead of an O(n) linear scan over
// `document.adoptedStyleSheets` (which would make many `<Style>` sheets O(n²)).
const adoptedSheets = new WeakSet<CSSStyleSheet>()

// ---------------------------------------------------------------------------
// Event delegation
//
// Bubbling events are dispatched through ONE listener per mount root
// (render/hydrate container, portal target) instead of one per element.
// Handlers live in `delegatedHandlers`; the shared dispatcher walks upward
// from `event.target`, so only kiko-managed elements under a registered root
// ever see events — foreign DOM captures nothing, and `detachDelegationRoot`
// (called on dispose) stops observation entirely. Nested roots dedupe through
// `invokedHandlers` so an element's handler fires once per event regardless
// of how many roots its propagation path crosses. Non-bubbling types (focus,
// blur, scroll, load, …) keep direct per-element listeners.

const DELEGATED_EVENTS: Record<string, true> = {
  beforeinput: true,
  change: true,
  click: true,
  contextmenu: true,
  dblclick: true,
  focusin: true,
  focusout: true,
  input: true,
  keydown: true,
  keypress: true,
  keyup: true,
  mousedown: true,
  mousemove: true,
  mouseout: true,
  mouseover: true,
  mouseup: true,
  pointercancel: true,
  pointerdown: true,
  pointermove: true,
  pointerout: true,
  pointerover: true,
  pointerup: true,
  submit: true,
  touchcancel: true,
  touchend: true,
  touchmove: true,
  touchstart: true,
  wheel: true,
}

const delegatedHandlers = new WeakMap<Element, Map<string, EventListener>>()
// Refcount, not a set: the same node can be registered by several owners
// (e.g. a render container that is also a portal target, or one target
// shared by two portals). Each owner detaches independently; listeners must
// survive until the LAST owner lets go.
const delegationRoots = new WeakMap<Node, number>()
const invokedHandlers = new WeakMap<Event, Set<Element>>()

function dispatchDelegated(event: Event): void {
  const type = event.type
  let invoked = invokedHandlers.get(event)
  if (!invoked) {
    invoked = new Set()
    invokedHandlers.set(event, invoked)
  }
  let node = event.target as Node | null
  while (node) {
    const fn = delegatedHandlers.get(node as Element)?.get(type)
    if (fn && !invoked.has(node as Element)) {
      invoked.add(node as Element)
      fn.call(node, event)
      // stopPropagation / stopImmediatePropagation end the walk, matching
      // native bubble semantics.
      if (event.cancelBubble) return
    }
    node = node.parentNode
  }
}

/** Register `container` as a delegation root (refcounted, idempotent per owner). */
export function attachDelegationRoot(container: Node): void {
  const count = delegationRoots.get(container) ?? 0
  if (count === 0) {
    for (const type of Object.keys(DELEGATED_EVENTS))
      container.addEventListener(type, dispatchDelegated)
  }
  delegationRoots.set(container, count + 1)
}

/** Release one owner's claim on `container`; listeners go when the last owner detaches. */
export function detachDelegationRoot(container: Node): void {
  const count = delegationRoots.get(container) ?? 0
  if (count <= 1) {
    if (count === 1) delegationRoots.delete(container)
    for (const type of Object.keys(DELEGATED_EVENTS))
      container.removeEventListener(type, dispatchDelegated)
    return
  }
  delegationRoots.set(container, count - 1)
}

function setDelegatedHandler(el: Element, type: string, fn: EventListener): void {
  let map = delegatedHandlers.get(el)
  if (!map) {
    map = new Map()
    delegatedHandlers.set(el, map)
  }
  map.set(type, fn)
}

export function trackWatcher(node: Node, watcher: Watcher): void {
  let set = nodeWatchers.get(node)
  if (!set) {
    set = new Set()
    nodeWatchers.set(node, set)
  }
  set.add(watcher)
}

/** Register a cleanup callback invoked when `cleanupWatchers` reaches this node. */
export function trackCleanup(node: Node, fn: () => void): void {
  let set = nodeCleanups.get(node)
  if (!set) {
    set = new Set()
    nodeCleanups.set(node, set)
  }
  set.add(fn)
}

// Scoped-style anchors are comment nodes whose text carries the scope attr
// (`kiko-scope:data-kiko-v1`). The scope ROOT is the nearest ancestor element
// of the anchor, so the attribute is applied when the anchor is inserted.
const SCOPE_PREFIX = "kiko-scope:"

function scopeAttrOf(node: Node): string | null {
  if (node.nodeType !== Node.COMMENT_NODE) return null
  const text = node.textContent ?? ""
  return text.startsWith(SCOPE_PREFIX) ? text.slice(SCOPE_PREFIX.length) : null
}

/**
 * Apply the scope attribute to `parent` for every scoped-style anchor inside
 * `child` (the anchor itself, or anchors flattened out of a fragment). Must
 * run before the node is moved so fragment children are still inspectable.
 * Vue stamps every element via its compiler; kiko has no compiler, so the
 * scope attribute lands on the single containing element and the rewritten
 * css matches its descendants — reactive swaps are covered for free.
 */
export function applyScopeRoots(child: Node, parent: Node): void {
  if (child.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    for (const c of Array.from(child.childNodes)) applyScopeRoots(c, parent)
    return
  }
  const attr = scopeAttrOf(child)
  if (attr === null || parent.nodeType !== Node.ELEMENT_NODE) return
  const host = parent as Element
  if (!host.hasAttribute(attr)) host.setAttribute(attr, "")
  // Re-adopt the sheet when the anchor was inserted after its subtree was
  // cleaned up (e.g. a Show branch that unmounted and remounted).
  const sheet = scopeSheets.get(child)
  if (sheet !== undefined && !isAdopted(sheet)) {
    adoptSheet(sheet, document)
    adoptedSheets.add(sheet)
    trackCleanup(child, () => {
      adoptedSheets.delete(sheet)
      unadoptSheet(sheet, document)
    })
  }
}

function isAdopted(sheet: CSSStyleSheet): boolean {
  return adoptedSheets.has(sheet)
}

export function cleanupWatchers(root: Node): void {
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    const cleanupSet = nodeCleanups.get(node)
    if (cleanupSet) {
      for (const fn of cleanupSet) {
        try {
          fn()
        } catch {
          // cleanup errors must not abort sibling cleanup
        }
      }
      nodeCleanups.delete(node)
    }
    const watcherSet = nodeWatchers.get(node)
    if (watcherSet) {
      for (const w of watcherSet) {
        // `watcher.unwatch()` with no args is a no-op in signal-polyfill — the
        // filter loop only removes signals passed in. Introspect the watched
        // sources and remove them explicitly so cleanup actually disconnects.
        const sources = Signal.subtle.introspectSources(w)
        if (sources.length > 0) w.unwatch(...sources)
      }
      nodeWatchers.delete(node)
    }
    for (const child of node.childNodes) stack.push(child)
  }
}

export function toNodes(value: unknown): Node[] {
  if (value == null || value === false || value === true) return []
  if (isPromiseLike(value)) {
    throw new Error("Promise rendered outside <Suspend> — wrap async components in <Suspend>")
  }
  if (value instanceof Node) return [value]
  if (Array.isArray(value)) {
    const out: Node[] = []
    const frag = document.createDocumentFragment()
    for (const c of value) {
      appendChild(frag, c)
      // Drain `frag` into `out`, reusing the single fragment across items.
      // `removeChild` detaches each node so the loop terminates and the node
      // is owned by `out` (and ultimately by its insertion parent).
      while (frag.firstChild) out.push(frag.removeChild(frag.firstChild))
    }
    return out
  }
  return [document.createTextNode(String(value))]
}

/**
 * Replace `old` nodes (siblings after `marker`) with `next`, cleaning up
 * watchers/cleanups on the removed nodes. Returns `next`. No-op if `marker`
 */
export function swapNodes(marker: Node, old: Node[], next: Node[]): Node[] {
  const parent = marker.parentNode
  if (!parent) {
    for (const n of next) cleanupWatchers(n)
    return next
  }
  for (const n of old) {
    cleanupWatchers(n)
    parent.removeChild(n)
  }
  const ref = marker.nextSibling
  for (const n of next) {
    applyScopeRoots(n, parent)
    parent.insertBefore(n, ref)
  }
  return next
}

/**
 * 分支换出/换入。`retainOld` 为 true 时旧分支只从 DOM 移除、保留
 * watcher/cleanup——用于 Show/Suspend/ErrorBoundary 的静态分支（同一批节点
 * 可能再次换入，cleanupWatchers 会删除其 watcher 集，导致重挂载后内部信号
 * 绑定"死亡"）。为 false 时与 `swapNodes` 相同（完整清理）。
 */
export function swapBranch(marker: Node, old: Node[], next: Node[], retainOld: boolean): Node[] {
  const parent = marker.parentNode
  if (!parent) {
    if (!retainOld) for (const n of old) cleanupWatchers(n)
    return next
  }
  for (const n of old) {
    parent.removeChild(n)
    if (!retainOld) cleanupWatchers(n)
  }
  const ref = marker.nextSibling
  for (const n of next) {
    applyScopeRoots(n, parent)
    parent.insertBefore(n, ref)
  }
  return next
}

function appendChild(parent: Node, child: unknown): void {
  if (child == null || child === false || child === true) return
  if (isPromiseLike(child)) {
    throw new Error("Promise rendered outside <Suspend> — wrap async components in <Suspend>")
  }

  if (isSignal(child)) {
    const signal = child as WatchableSignal<unknown>
    const marker = document.createComment("")
    parent.appendChild(marker)
    let current = toNodes(signal.get())
    // Snapshot the marker's current sibling once: insertBefore(n, ref) keeps
    // insertion order. Re-reading marker.nextSibling each iteration would
    // place each node before the previous one, reversing the array.
    const ref = marker.nextSibling
    for (const n of current) {
      applyScopeRoots(n, parent)
      parent.insertBefore(n, ref)
    }

    const render = (): void => {
      current = swapNodes(marker, current, toNodes(signal.get()))
    }

    // watchSignal 保证 re-arm:渲染抛错(如 Promise 渲染到 Suspend 外)后
    // 绑定不会永久失效
    const watcher = watchSignal(signal, render)
    trackWatcher(marker, watcher)
    return
  }

  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)))
    return
  }
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c)
    return
  }
  if (child instanceof Node) {
    applyScopeRoots(child, parent)
    parent.appendChild(child)
    return
  }
  parent.appendChild(document.createTextNode(String(child)))
}

const SVG_NS = "http://www.w3.org/2000/svg"

// SVG-only tag names (no HTML collision). Ambiguous ones (a, script, style, title)
// default to HTML namespace; opt into SVG via a parent <svg> at the DOM level.
const SVG_TAGS = new Set([
  "svg",
  "path",
  "circle",
  "ellipse",
  "rect",
  "g",
  "defs",
  "use",
  "symbol",
  "linearGradient",
  "radialGradient",
  "stop",
  "text",
  "tspan",
  "polygon",
  "polyline",
  "line",
  "image",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "filter",
  "feGaussianBlur",
  "feOffset",
  "feMerge",
  "feMergeNode",
  "feColorMatrix",
  "feFlood",
  "feComposite",
  "feTile",
  "feTurbulence",
  "feDisplacementMap",
  "feFuncR",
  "feFuncG",
  "feFuncB",
  "feFuncA",
  "feComponentTransfer",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feSpecularLighting",
  "feDistantLight",
  "fePointLight",
  "feSpotLight",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "foreignObject",
  "desc",
  "metadata",
  "switch",
  "view",
  "hatch",
  "hatchpath",
  "solidcolor",
])

// Attributes rendered as presence/absence (empty string) rather than their value.
const BOOLEAN_ATTRS = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
  "truespeed",
])

type StyledElement = HTMLElement | SVGElement

function applyStyle(el: StyledElement, value: unknown): void {
  if (typeof value === "string") {
    el.setAttribute("style", value)
    return
  }
  if (value && typeof value === "object") {
    const src = value as Record<string, string>
    const style = el.style
    for (const prop of Object.keys(src)) style.setProperty(prop, src[prop] ?? "")
  }
}

// Apply a concrete (non-signal) value for one prop key.
function applyProp(el: StyledElement, key: string, value: unknown): void {
  if (key === "style") {
    applyStyle(el, value)
    return
  }

  if (BOOLEAN_ATTRS.has(key)) {
    if (value === false || value == null) el.removeAttribute(key)
    else el.setAttribute(key, "")
    return
  }

  if (key.startsWith("on") && typeof value === "function") {
    // `onClickCapture` → type "click", capture phase. Capture handlers stay
    // direct native listeners: they are rare, and delegation cannot reproduce
    // exact capture semantics (top-down order + stopPropagation cutting the
    // walk before target) without a second listener set per root.
    const capture = key.endsWith("Capture")
    const type = key.slice(2, capture ? -7 : undefined).toLowerCase()
    if (!capture && DELEGATED_EVENTS[type]) setDelegatedHandler(el, type, value as EventListener)
    else el.addEventListener(type, value as EventListener, capture)
    return
  }

  // `key in el` is true for IDL properties (id, value, className, ...);
  // assigning via the property keeps form state and reflection in sync. Some
  // IDL props are readonly (notably SVG animated lengths like `width`/`cx`/
  // `r`); fall back to the attribute when assignment throws, preserving the
  // original (spec-correct) casing. Unknown keys use the attribute directly;
  // camelCase → kebab-case so SVG presentation attrs (`strokeWidth` →
  // `stroke-width`) land on the right DOM attribute name.
  if (key in el) {
    const host = el as unknown as Record<string, unknown>
    if (value == null) {
      // IDL 属性赋 null/undefined 会被 WebIDL 转成 "null"/"undefined" 字符串
      // （如 <input value={undefined}> 会显示 "undefined"）；移除属性回退默认值
      el.removeAttribute(key)
      return
    }
    try {
      host[key] = value
    } catch {
      el.setAttribute(key, String(value))
    }
  } else {
    const name = /[A-Z]/.test(key) ? key.replace(/[A-Z]/g, m => "-" + m.toLowerCase()) : key
    el.setAttribute(name, value == null ? "" : String(value))
  }
}

function setRef(el: StyledElement, value: unknown): void {
  if (typeof value === "function") {
    const refFn = value as (el: StyledElement) => void | (() => void)
    const cleanup = refFn(el)
    if (typeof cleanup === "function") {
      trackCleanup(el, cleanup)
    }
    return
  }
  if (value && typeof value === "object" && "current" in value) {
    const refObj = value as { current: StyledElement | null }
    refObj.current = el
  }
}

export function setProp(el: StyledElement, key: string, value: unknown): void {
  if (key === "children" || key === "key") return

  if (key === "ref") {
    setRef(el, value)
    return
  }

  // Normalize `className` to the DOM `class` attribute/property.
  if (key === "className") {
    setProp(el, "class", value)
    return
  }

  if (isSignal(value)) {
    const signal = value as WatchableSignal<unknown>

    // State carried across updates so event listeners and style-object
    // properties replace rather than accumulate. Without this, each signal
    // change would addEventListener again (leak + double-fire) and leave
    // stale CSS properties on the element.
    let prevHandler: { type: string; fn: EventListener; capture: boolean } | null = null
    let prevStyleKeys: string[] | null = null

    const apply = (): void => {
      const v = signal.get()
      if (key === "style") {
        if (typeof v === "string") {
          el.setAttribute("style", v)
          prevStyleKeys = null
        } else if (v && typeof v === "object") {
          const src = v as Record<string, string>
          const newKeys = Object.keys(src)
          if (prevStyleKeys) {
            for (const k of prevStyleKeys) if (!(k in src)) el.style.removeProperty(k)
          }
          for (const k of newKeys) el.style.setProperty(k, src[k] ?? "")
          prevStyleKeys = newKeys
        } else {
          el.removeAttribute("style")
          prevStyleKeys = null
        }
        return
      }
      if (key.startsWith("on") && typeof v === "function") {
        const capture = key.endsWith("Capture")
        const type = key.slice(2, capture ? -7 : undefined).toLowerCase()
        if (!capture && DELEGATED_EVENTS[type]) {
          // Delegated handlers replace by WeakMap entry — no listener churn.
          setDelegatedHandler(el, type, v as EventListener)
          return
        }
        if (prevHandler)
          el.removeEventListener(prevHandler.type, prevHandler.fn, prevHandler.capture)
        const fn = v as EventListener
        prevHandler = { type, fn, capture }
        el.addEventListener(type, fn, capture)
        return
      }
      applyProp(el, key, v)
    }

    apply()

    // watchSignal 保证 re-arm:apply 抛错后绑定不会永久失效
    const watcher = watchSignal(signal, apply)
    trackWatcher(el, watcher)
    return
  }

  applyProp(el, key, value)
}

export function jsx(tag: string | Component<any>, props: Props | null): Node
export function jsx(tag: AsyncComponent<any>, props: Props | null): Promise<Node>
export function jsx(
  tag: string | Component<any> | AsyncComponent<any>,
  props: Props | null,
): Node | Promise<Node> {
  const p = props ?? ({} as Props)

  if (isHydrating()) {
    // 水合模式下返回 PendingNode（惰性采纳），类型签名保持客户端语义
    return hydrateJsx(tag, p) as unknown as Node | Promise<Node>
  }

  const ssr = getSSRRuntime()
  if (ssr) {
    // SSR 模式下实际返回 string | Promise<string>，类型签名保持客户端语义
    return ssr.jsx(tag, p) as unknown as Node | Promise<Node>
  }

  if (typeof tag === "function") {
    return tag(p)
  }

  // `<style>` is the intrinsic spelling of the Style component: scoped by
  // default, `<style global>` opts into global (unscoped) css.
  if (tag === "style") {
    return Style(p as StyleProps)
  }

  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
  for (const key of Object.keys(p)) {
    setProp(el, key, p[key])
  }
  appendChild(el, p.children)
  return el
}

export function Fragment(props: Props): DocumentFragment {
  if (isHydrating()) return hydrateFragment(props.children) as unknown as DocumentFragment
  const ssr = getSSRRuntime()
  if (ssr) return ssr.fragment(props.children) as unknown as DocumentFragment
  const frag = document.createDocumentFragment()
  appendChild(frag, props.children)
  return frag
}

export interface StyleProps {
  /** CSS text: a string, a signal of CSS text, or nested arrays of those. */
  children?: unknown
  /**
   * Opt out of scoping: adopt the css globally, without selector rewriting.
   * By default (no `global`), selectors are rewritten and scoped to the
   * nearest ancestor element — Vue-style scoped CSS.
   */
  global?: boolean
  /** CSP nonce for the fallback `<style>` element (ignored with constructable sheets). */
  nonce?: string
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

function collectCssSignals(children: unknown): WatchableSignal<unknown>[] {
  const out: WatchableSignal<unknown>[] = []
  const visit = (value: unknown): void => {
    if (value == null || value === false || value === true) return
    if (isSignal(value)) {
      out.push(value as WatchableSignal<unknown>)
      const inner = (value as WatchableSignal<unknown>).get()
      if (Array.isArray(inner)) for (const c of inner) visit(c)
      return
    }
    if (Array.isArray(value)) for (const c of value) visit(c)
  }
  visit(children)
  return out
}

/**
 * `<Style>` — a css-in-JS style element built on constructable stylesheets.
 *
 * `children` is the css text (string, signal, or arrays of those). By default
 * selectors are rewritten to match the nearest ancestor element of the style
 * anchor (the element that contains the `<Style>` in the DOM) and that element
 * gets a unique scope attribute — Vue-style scoped css without a template
 * compiler, and reactive subtrees are covered automatically because scoping
 * matches by descendant. Pass `global` to adopt the css unscoped.
 *
 * Rendering uses `new CSSStyleSheet()` + `document.adoptedStyleSheets` when
 * available (Chrome 73+, Firefox 101+, Safari 16.4+); otherwise it falls back
 * to a real `<style>` element carrying the (rewritten) css text. The returned
 * node is a comment anchor (adopted mode) or a fragment of anchor + `<style>`
 * element (fallback mode); the sheet is un-adopted when the anchor's subtree
 * is disposed via `cleanupWatchers`.
 */
export function Style(props: StyleProps): Node {
  if (isHydrating()) return hydrateStyle(props) as unknown as Node
  const ssr = getSSRRuntime()
  if (ssr) return ssr.style(props as unknown as Record<string, unknown>) as unknown as Node
  const scoped = !props.global
  const attr = scoped ? createScopeAttr() : null
  const constructable = supportsConstructable()

  const anchor: Node = constructable
    ? document.createComment(scoped ? SCOPE_PREFIX + attr : "kiko-style")
    : (() => {
        const frag = document.createDocumentFragment()
        frag.appendChild(document.createComment(scoped ? SCOPE_PREFIX + attr : "kiko-style"))
        const el = document.createElement("style")
        if (props.nonce) el.setAttribute("nonce", props.nonce)
        frag.appendChild(el)
        return frag
      })()

  const sheet = constructable ? createSheet() : null

  const render = (): void => {
    const css = extractCssText(props.children)
    const rewritten = attr === null ? css : rewriteScopedCss(css, attr)
    if (sheet !== null) {
      sheet.replaceSync(rewritten)
    } else {
      // fallback mode: the anchor fragment's last child is the <style> element
      const el = anchor.lastChild as HTMLStyleElement | null
      if (el !== null) el.textContent = rewritten
    }
  }

  render()

  if (sheet !== null) {
    scopeSheets.set(anchor, sheet)
    adoptSheet(sheet, document)
    adoptedSheets.add(sheet)
    const adopted = sheet
    trackCleanup(anchor, () => {
      adoptedSheets.delete(adopted)
      unadoptSheet(adopted, document)
    })
  }

  const signals = collectCssSignals(props.children)
  if (signals.length > 0) {
    const watcher = createWatcher(() => {
      queueMicrotask(() => {
        // render 抛错（如非法 css 值）上报后仍在 finally 中 re-arm
        try {
          render()
        } catch (err) {
          reportError(err)
        } finally {
          watcher.watch(...signals)
        }
      })
    })
    watcher.watch(...signals)
    trackWatcher(anchor, watcher)
  }

  return anchor
}

export const jsxDEV = jsx
export const jsxs = jsx
