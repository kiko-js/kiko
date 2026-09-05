/**
 * htm 模板字符串 demo（无构建 JSX）。
 * 胶水代码把 htm 接到 kiko 的 jsx 工厂——组件、信号、scoped css 行为完全一致。
 */
import htm from "htm"
import { Fragment, jsx } from "@kikojs/dom"
import { createSignal } from "@kikojs/dom"
import type { Component, Props } from "@kikojs/dom"

const h = (tag: string | Component<any>, props: Props | null, ...children: unknown[]): Node =>
  jsx(tag, { ...(props ?? {}), children: children.length === 1 ? children[0] : children })

const renderTemplate = htm.bind(h)

function dom(strings: TemplateStringsArray, ...values: unknown[]): Node {
  const result = renderTemplate(strings, ...values) as Node | Node[]
  return Array.isArray(result) ? Fragment({ children: result }) : result
}

export function HtmDemo(): Node {
  const count = createSignal(0)

  return dom`<div class="counter">
  <style>
    .counter { display: flex; gap: 0.5rem; align-items: center; }
    .counter button { padding: 0.25rem 0.75rem; }
    .counter span { min-width: 2rem; text-align: center; font-weight: 700; }
  </style>
  <button onClick=${() => count.set(count.get() - 1)}>-</button>
  <span>${count}</span>
  <button onClick=${() => count.set(count.get() + 1)}>+</button>
</div>`
}
