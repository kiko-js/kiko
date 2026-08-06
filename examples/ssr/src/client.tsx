/** @jsxImportSource @kikojs/dom */
import { hydrate } from "@kikojs/dom"
import { App } from "./App"

// 客户端入口：水合服务端产出的 DOM（信号绑定、事件监听、控制流接管）。
hydrate(() => <App />, document.getElementById("root")!)
