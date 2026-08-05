import htm from "htm"
import { jsx, Fragment, createSignal, render } from "@kikojs/dom"
import type { Component, Props } from "@kikojs/dom"

// —— 胶水代码：把 htm 接到 kiko 的 jsx 工厂（约 10 行，通常放一个公共模块）——
// JSX 编译器把 <div class="a">{x}</div> 翻译成 jsx("div", { class: "a", children: x })；
// htm 在运行时做同样的翻译。h 之后的一切（组件、信号、scoped css、Show / For）
// 都是 kiko 已有的能力，无需重新实现。

const h = (
  tag: string | Component<any>,
  props: Props | null,
  ...children: unknown[]
): Node => jsx(tag, { ...(props ?? {}), children: children.length === 1 ? children[0] : children })

// htm 始终以数组形式传 children，而 JSX 编译器单个表达式直接传入；
// 长度 1 时解包，保证组件函数 children（<${For}>${fn}</${For}>）原样到达。
const renderTemplate = htm.bind(h)

function dom(strings: TemplateStringsArray, ...values: unknown[]): Node {
  const result = renderTemplate(strings, ...values) as Node | Node[]
  // 多根模板返回数组 → 用 Fragment 包裹
  return Array.isArray(result) ? Fragment({ children: result }) : result
}

// —— 用法：与 JSX 相同的语法，标签模板形式 ——
const count = createSignal(0)

const counter = dom`<div class="counter">
  <style>
    .counter { display: flex; gap: 0.5rem; align-items: center; }
    .counter .value { font-weight: 700; color: #0969da; }
  </style>
  <button onClick=${() => count.set(count.get() - 1)}>-</button>
  <span class="value">${count}</span>
  <button onClick=${() => count.set(count.get() + 1)}>+</button>
</div>`

render(counter, document.getElementById("app")!)
