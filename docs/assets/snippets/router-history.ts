import { createPathHistory, createHashHistory } from "@kikojs/router"

// createRouter 内部按 mode 自动选择 adapter；
// 两个工厂也可单独创建，用于测试或非浏览器环境。
// 两种 adapter 的方法语义完全一致，只有 URL 读写方式不同：
//   getPath() = 路径 + query（不含 base、不含 # 片段）
//   getHash() = # 片段（不含 #，无片段则为空字符串）
const pathHistory = createPathHistory()
const hashHistory = createHashHistory()

console.log(pathHistory.getPath()) // 当前路由路径（如 /search?q=hello）
console.log(pathHistory.getHash()) // 当前 hash 片段（如 frag，无则为 ""）
console.log(hashHistory.getPath()) // 与 path 模式相同的语义（hash 模式下即 # 后的路径）
console.log(hashHistory.getHash()) // hash 模式没有独立片段，恒为 ""

const stop = hashHistory.listen(() => console.log("hash changed"))
stop() // 停止监听
