import { createEmitter } from "@kikojs/signal"

// 类型化事件：事件名 → 载荷类型
type Events = {
  update: number
  delete: number
}

const emitter = createEmitter<Events>()
const off = emitter.on("update", (id) => console.log("updated", id))

emitter.emit("update", 42) // "updated 42"
off() // 取消订阅
