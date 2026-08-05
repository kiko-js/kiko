import { createSignal, isSignal } from "@kikojs/signal"

// createSignal 返回标准 TC39 Signals 接口：.get() 读取，.set() 写入
const count = createSignal(0)

count.set(count.get() + 1)
console.log(count.get()) // 1

// isSignal 是类型守卫，同时识别 State 与 Computed
console.log(isSignal(count)) // true
console.log(isSignal(42)) // false

// 任何消费 Signal.State 的库（signal-polyfill、框架适配层）都可用
const other = createSignal("kiko")
other.set("dom")
console.log(other.get()) // "dom"
