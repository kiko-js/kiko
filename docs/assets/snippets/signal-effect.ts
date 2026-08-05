import { createSignal, effect } from "@kikojs/signal"

const count = createSignal(0)

// effect：自动追踪依赖，变化时（微任务批量后）重新执行
const dispose = effect(() => {
  console.log("count:", count.get())
})

count.set(1) // 微任务后打印 "count: 1"

dispose() // 停止追踪，之后 set 不再触发
