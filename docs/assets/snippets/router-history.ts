import { createPathHistory, createHashHistory } from "@kikojs/router"

// createRouter 内部按 mode 自动选择 adapter；
// 这两个工厂也可单独创建，用于测试或非浏览器环境。
const pathHistory = createPathHistory()
const hashHistory = createHashHistory()

console.log(pathHistory.getPath()) // 当前路径（不含 base）
console.log(hashHistory.getHash()) // 当前 hash（含 # 后的内容）

const stop = hashHistory.listen(() => console.log("hash changed"))
stop() // 停止监听
