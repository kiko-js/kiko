import { createSignal, computed } from "@kikojs/signal"

const count = createSignal(1)

// computed：只读派生信号，自动追踪依赖
const doubled = computed(() => count.get() * 2)
console.log(doubled.get()) // 2

count.set(5)
console.log(doubled.get()) // 10

// derived(fn) 是 computed 的别名，已弃用——新代码请直接使用 computed
