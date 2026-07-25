import { createSignal, computed, effect, batch } from "@kikojs/signal"

const first = createSignal("Li")
const last = createSignal("Hua")
const full = computed(() => `${first.get()} ${last.get()}`)

effect(() => {
  console.log(full.get())
})

batch(() => {
  first.set("Wang")
  last.set("Fang")
})
