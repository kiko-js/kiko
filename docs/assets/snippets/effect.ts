import { createSignal, effect, batch } from "@kikojs/signal"

const a = createSignal(1)
const b = createSignal(2)

effect(() => {
  console.log("sum =", a.get() + b.get())
})

batch(() => {
  a.set(10)
  b.set(20)
})
