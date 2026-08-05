import { createSignal, effect, batch } from "@kikojs/signal"

const a = createSignal(1)
const b = createSignal(2)
effect(() => console.log(a.get(), b.get()))

// batch：合并内部所有写入，统一在结束时刷新一次
batch(() => {
  a.set(10)
  b.set(20)
})
// 只打印一次 "10 20"
