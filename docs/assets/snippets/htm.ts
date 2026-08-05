import { createSignal, dom, render } from "@kikojs/dom"

// 无 JSX 编译器：标签模板在运行时翻译，走与 JSX 相同的 jsx 工厂。
// 组件、信号、scoped css、Show/For 行为完全一致。

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
