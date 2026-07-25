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
      <h1>Kiko Counter with tailwindcss</h1>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <div className="flex mt-2 gap-0.5">
        <Button onClick={() => count.set(count.get() + 1)}>+1</Button>
        <Button onClick={() => count.set(count.get() - 1)}>-1</Button>
        <Button onClick={() => count.set(0)}>Reset</Button>
      </div>
    </main>
  )
}

interface ButtonProps {
  onClick: () => void
  children: string
}

function Button({ onClick, children }: ButtonProps) {
  return (
    <button
      className="cursor-pointer px-0.5 py-1 border-b-black border-2 rounded-md "
      onClick={onClick}
    >
      {children}
    </button>
  )
}

render(<App />, document.getElementById("app")!)
