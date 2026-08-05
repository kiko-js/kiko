/**
 * `dom` — an htm (https://github.com/developit/htm) tagged-template runtime
 * for environments without a JSX compiler: plain browsers, buildless scripts,
 * REPLs.
 *
 * Where a JSX compiler translates `<div class="a">{x}</div>` into
 * `jsx("div", { class: "a", children: x })`, `dom` performs the same
 * translation at runtime: the template is parsed once per unique template
 * literal and every element goes through the same `jsx` factory that JSX
 * compiles to — components, signals, `<style>` scoping, event props and
 * structural reactivity behave identically. Nothing after the factory is
 * reimplemented.
 *
 * Usage mirrors JSX:
 *
 *   dom`<div class=${cls}>${children}</div>`
 *   dom`<${Card} title=${t}>slot</${Card}>`
 *   dom`<div ...${props} />`
 *
 * Grammar is htm's: `${expr}` interpolations in text, attribute values,
 * quoted attribute values (stringified), tag positions (`<${Tag}>`) and
 * `...${props}` spreads. Whitespace follows JSX semantics (newline-anchored
 * whitespace text nodes are dropped). Multi-root templates return a
 * DocumentFragment. Known htm limitations: `<!DOCTYPE>` is treated as a tag,
 * and dynamic tag names must be whole interpolations (`<${Tag}>`, not
 * `<my-${x}>`).
 */

import htmFactory from "htm"
import { jsx, Fragment } from "./jsx-runtime"
import type { Component } from "./jsx-runtime"

// htm calls h(tag, props, ...children); kiko's jsx factory carries children
// in `props.children` — the adapter is the only glue needed.
const h = (
  tag: string | Component<any>,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Node => jsx(tag, { ...(props ?? {}), children })

const render = htmFactory.bind(h)

export function dom(strings: TemplateStringsArray, ...values: unknown[]): Node {
  const result = render(strings, ...values) as Node | Node[]
  // htm returns an array for multi-root templates — flatten into a fragment.
  return Array.isArray(result) ? Fragment({ children: result }) : result
}

/** Alias of `dom`. */
export const htm = dom
