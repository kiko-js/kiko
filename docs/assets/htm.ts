import { createSignal, dom, render } from "@kikojs/dom"

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
