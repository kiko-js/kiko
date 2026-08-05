import { createSignal, toSignalValue, watchValue } from "@kikojs/signal"

const count = createSignal(1)

// toSignalValue：读取 signal 当前值；普通值直接返回
console.log(toSignalValue(count)) // 1
console.log(toSignalValue(42)) // 42

// watchValue：监听变化并自动追踪，返回 watcher（普通值则立即回调一次并返回 null）
const watcher = watchValue(count, (v) => {
  console.log("count =", v)
})

count.set(2) // "count = 2"

watcher?.unwatch(count) // 停止监听
