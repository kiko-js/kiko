/** @jsxImportSource @kikojs/dom */
import { hydrateWithState } from "@kikojs/dom"
import { App } from "./App"

// 客户端入口：页面内嵌有 kiko-state 信号状态脚本块（/ 路由）时先恢复服务端
// 快照再水合；没有（/stream 路由）则按客户端初始值水合。
hydrateWithState(() => <App />, document.getElementById("root")!)
