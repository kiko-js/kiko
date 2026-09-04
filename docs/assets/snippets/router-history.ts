import { effect } from "@kikojs/signal"
import { createPathHistory, createHashHistory } from "@kikojs/router"

// createRouter 内部按 mode 自动选择 adapter；
// 两个工厂也可单独创建，用于测试或非浏览器环境。
// location 信号是唯一事实源：push/replace/go 与浏览器事件都会同步它。
// HistoryLocation = { path, hash, state }——path 含 query，hash 不含 #。
const pathHistory = createPathHistory()
const hashHistory = createHashHistory()

console.log(pathHistory.location.get()) // 当前位置（如 { path: "/search?q=hello", hash: "", state: null }）
console.log(pathHistory.location.get().path) // 路径 + query（不含 base）
console.log(pathHistory.location.get().hash) // hash 片段（不含 #，无片段则为 ""）
console.log(hashHistory.location.get()) // hash 模式：path 即 # 后的路径，hash 恒为 ""

const stop = effect(() => {
  console.log("history changed", hashHistory.location.get())
})
stop() // 停止监听
