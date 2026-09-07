/** @jsxImportSource @kikojs/dom */
import { hydrate } from "@kikojs/dom"
import { App } from "./App"

// 客户端入口：hydrate 自动恢复页面内嵌的 kiko-state 信号状态（/ 路由）；
// 没有（/stream 路由）则按客户端初始值水合。
hydrate(() => <App />, document.getElementById("root")!)
