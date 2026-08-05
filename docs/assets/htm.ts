import htm from "htm"
import { jsx, Fragment, createSignal, render } from "@kikojs/dom"
import type { Component, Props } from "@kikojs/dom"

// 胶水代码：把 htm 接到 kiko 的 jsx 工厂（详见 docs/assets/snippets/htm.ts 的注释）
const h = (tag: string | Component<any>, props: Props | null, ...children: unknown[]): Node =>
  jsx(tag, { ...(props ?? {}), children: children.length === 1 ? children[0] : children })

const renderTemplate = htm.bind(h)

function dom(strings: TemplateStringsArray, ...values: unknown[]): Node {
  const result = renderTemplate(strings, ...values) as Node | Node[]
  return Array.isArray(result) ? Fragment({ children: result }) : result
}

const count = createSignal(0)

const counter = dom`<div class="counter">
  <style>
    .counter { display: flex; gap: 0.5rem; align-items: center; }
    .counter button { padding: 0.25rem 0.75rem; }
    .counter span { min-width: 2rem; text-align: center; font-weight: 700; }
  </style>
  <button onClick=${() => count.set(count.get() - 1)}>-</button>
  <span>${count}</span>
  <button onClick=${() => count.set(count.get() + 1)}>+</button>
</div>`

render(counter, document.getElementById("htm-root")!)
