import { createSignal, effect, untrack } from "@kikojs/signal"

const a = createSignal(1)
const b = createSignal(2)

effect(() => {
  // untrack：读取但不订阅，a 变化不会触发重跑
  const v = untrack(() => a.get())
  console.log(v, b.get()) // 只在 b 变化时重跑
})

b.set(20) // 打印 "1 20"
