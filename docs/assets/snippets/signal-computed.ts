import { createSignal, computed, derived } from "@kikojs/signal"

const count = createSignal(1)

// computed：只读派生信号，自动追踪依赖
const doubled = computed(() => count.get() * 2)
console.log(doubled.get()) // 2

count.set(5)
console.log(doubled.get()) // 10

// derived 是 computed 的别名
const label = derived(() => `count = ${count.get()}`)
console.log(label.get()) // "count = 5"
