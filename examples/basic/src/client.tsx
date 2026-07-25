import { createSignal, render } from "@kikojs/dom"
import { computed, effect } from "@kikojs/signal"

function App() {
  const count = createSignal(0)
  const doubled = computed(() => count.get() * 2)

  effect(() => {
    document.title = `Count is ${count.get()}`
  })

  return (
    <main>
      <h1>Kiko Counter</h1>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <div className="actions">
        <button onClick={() => count.set(count.get() + 1)}>+1</button>
        <button onClick={() => count.set(count.get() - 1)}>-1</button>
        <button onClick={() => count.set(0)}>Reset</button>
      </div>
    </main>
  )
}

render(<App />, document.getElementById("app")!)
