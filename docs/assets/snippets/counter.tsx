/** @jsxImportSource @kikojs/dom */
import { createSignal, render } from "@kikojs/dom"

function Counter() {
  const count = createSignal(0)

  return (
    <div class="counter">
      <button onClick={() => count.set(count.get() - 1)}>-</button>
      <span>{count}</span>
      <button onClick={() => count.set(count.get() + 1)}>+</button>
    </div>
  )
}

render(<Counter />, document.getElementById("app"))
