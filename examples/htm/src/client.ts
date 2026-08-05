import htm from "htm"
import { jsx, Fragment, For, createSignal, render } from "@kikojs/dom"
import type { Component, Props } from "@kikojs/dom"

// —— 胶水代码：把 htm 接到 kiko 的 jsx 工厂（约 10 行）——
// JSX 编译器把 <div class="a">{x}</div> 翻译成 jsx("div", { class: "a", children: x })；
// htm 在运行时做同样的翻译。h 之后的一切（组件、信号、scoped css、Show / For）
// 都是 kiko 已有的能力。生产项目通常把这 10 行放进一个公共模块（如 src/dom.ts）。

const h = (tag: string | Component<any>, props: Props | null, ...children: unknown[]): Node =>
  jsx(tag, { ...(props ?? {}), children: children.length === 1 ? children[0] : children })

const renderTemplate = htm.bind(h)

function dom(strings: TemplateStringsArray, ...values: unknown[]): Node {
  const result = renderTemplate(strings, ...values) as Node | Node[]
  return Array.isArray(result) ? Fragment({ children: result }) : result
}

/**
 * This example uses `dom` tagged templates instead of JSX — the template is
 * parsed at runtime and routed through the same `jsx` factory JSX compiles
 * to. No JSX compiler, no build step for the source; components, signals,
 * `<style>` scoping and control flow all behave identically.
 *
 * In a plain browser (no bundler) the same code runs directly from a CDN:
 *
 *   import { render, createSignal } from "https://esm.sh/@kikojs/dom"
 *   import htm from "https://esm.sh/htm"
 */

function Counter() {
  const count = createSignal(0)
  return dom`<section class="panel">
    <style>
      .panel { border: 1px solid #e1e4e8; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
      .panel .value { font-weight: 700; color: #0969da; }
      .panel button { margin: 0 0.25rem; padding: 0.25rem 0.75rem; }
    </style>
    <h2>Counter</h2>
    <p>Count: <span class="value">${count}</span></p>
    <button onClick=${() => count.set(count.get() - 1)}>-1</button>
    <button onClick=${() => count.set(count.get() + 1)}>+1</button>
    <button onClick=${() => count.set(0)}>Reset</button>
  </section>`
}

function Todo() {
  const items = createSignal(["buildless JSX", "reactive DOM", "scoped css"])
  const input = createSignal("")
  const add = () => {
    const v = input.get().trim()
    if (v !== "") items.set([...items.get(), v])
    input.set("")
  }
  return dom`<section class="panel">
    <h2>Todo</h2>
    <input
      value=${input}
      onInput=${(e: Event) => input.set((e.target as HTMLInputElement).value)}
      placeholder="new item"
    />
    <button onClick=${add}>Add</button>
    <ul>
      <${For} each=${items}>${(item: string) => dom`<li>${item}</li>`}</${For}>
    </ul>
  </section>`
}

function App() {
  return dom`<main>
    <h1>kiko · buildless</h1>
    <p class="sub">
      Powered by <code>dom</code> tagged templates — the same <code>jsx</code> factory
      JSX compiles to, parsed at runtime.
    </p>
    <${Counter} />
    <${Todo} />
  </main>`
}

render(App(), document.getElementById("app")!)
