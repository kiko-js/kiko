import { Signal } from "signal-polyfill"
import { createWatcher, isSignal } from "./signal"
import type { WatchableSignal, Watcher } from "./signal"

export type Props = Record<string, unknown> & { children?: unknown }
export type Component<P = Props> = (props: P) => Node
export type AsyncComponent<P = Props> = (props: P) => Promise<Node>

export type { JSX } from "./jsx-types"

// Track watchers per node for cleanup
const nodeWatchers = new WeakMap<Node, Set<Watcher>>()
// Track arbitrary cleanup callbacks per node (e.g. React root unmount)
const nodeCleanups = new WeakMap<Node, Set<() => void>>()

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

export function cleanupWatchers(root: Node): void {
  const cleanupSet = nodeCleanups.get(root)
  if (cleanupSet) {
    for (const fn of cleanupSet) {
      try {
        fn()
      } catch {
        // cleanup errors must not abort sibling cleanup
      }
    }
    nodeCleanups.delete(root)
  }
  const watcherSet = nodeWatchers.get(root)
  if (watcherSet) {
    for (const w of watcherSet) {
      // `watcher.unwatch()` with no args is a no-op in signal-polyfill — the
      // filter loop only removes signals passed in. Introspect the watched
      // sources and remove them explicitly so cleanup actually disconnects.
      const sources = Signal.subtle.introspectSources(w)
      if (sources.length > 0) w.unwatch(...sources)
    }
    nodeWatchers.delete(root)
  }
  for (const child of root.childNodes) cleanupWatchers(child)
}

export function toNodes(value: unknown): Node[] {
  if (value == null || value === false || value === true) return []
  if (value instanceof Node) return [value]
  if (Array.isArray(value)) {
    const out: Node[] = []
    for (const c of value) {
      const frag = document.createDocumentFragment()
      appendChild(frag, c)
      for (const n of frag.childNodes) out.push(n as Node)
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
  for (const n of next) parent.insertBefore(n, ref)
  return next
}

function appendChild(parent: Node, child: unknown): void {
  if (child == null || child === false || child === true) return

  if (isSignal(child)) {
    const signal = child as WatchableSignal<unknown>
    const marker = document.createComment("")
    parent.appendChild(marker)
    let current = toNodes(signal.get())
    // Snapshot the marker's current sibling once: insertBefore(n, ref) keeps
    // insertion order. Re-reading marker.nextSibling each iteration would
    // place each node before the previous one, reversing the array.
    const ref = marker.nextSibling
    for (const n of current) parent.insertBefore(n, ref)

    const render = (): void => {
      current = swapNodes(marker, current, toNodes(signal.get()))
    }

    const watcher = createWatcher(() => {
      queueMicrotask(() => {
        render()
        watcher.watch(signal)
      })
    })
    watcher.watch(signal)
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
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
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
    try {
      host[key] = value
    } catch {
      el.setAttribute(key, value == null ? "" : String(value))
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

function setProp(el: StyledElement, key: string, value: unknown): void {
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
    let prevHandler: { type: string; fn: EventListener } | null = null
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
        const type = key.slice(2).toLowerCase()
        if (prevHandler) el.removeEventListener(prevHandler.type, prevHandler.fn)
        const fn = v as EventListener
        prevHandler = { type, fn }
        el.addEventListener(type, fn)
        return
      }
      applyProp(el, key, v)
    }

    apply()

    const watcher = createWatcher(() => {
      queueMicrotask(() => {
        apply()
        watcher.watch(signal)
      })
    })
    watcher.watch(signal)
    trackWatcher(el, watcher)
    return
  }

  applyProp(el, key, value)
}

export function jsx(tag: string | Component<any>, props: Props | null): Node {
  const p = props ?? ({} as Props)

  if (typeof tag === "function") {
    return tag(p)
  }

  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
  for (const key of Object.keys(p)) {
    setProp(el, key, p[key])
  }
  appendChild(el, p.children)
  return el
}

export function Fragment(props: Props): DocumentFragment {
  const frag = document.createDocumentFragment()
  appendChild(frag, props.children)
  return frag
}

export const jsxDEV = jsx
export const jsxs = jsx
