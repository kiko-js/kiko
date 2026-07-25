import { createSignal, jsx, render } from "@kikojs/dom"

const count = createSignal(0)

const counter = jsx("div", {
  className: "counter",
  children: [
    jsx("button", {
      onClick: () => count.set(count.get() - 1),
      children: "-",
    }),
    jsx("span", { children: count }),
    jsx("button", {
      onClick: () => count.set(count.get() + 1),
      children: "+",
    }),
  ],
})

render(counter, document.getElementById("counter-root")!)
