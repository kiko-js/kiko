/** @jsxImportSource @kikojs/dom */
import { render } from "@kikojs/dom"
import { Router } from "@kikojs/router"
import { App } from "./app"
import { router } from "./routes"

// Router 提供路由上下文；App 里的 Link / Outlet 从上下文取 router。
// render 把整棵树挂到 #app，返回 dispose() 用于整体卸载。
render(
  <Router router={router}>
    <App />
  </Router>,
  document.getElementById("app")!,
)
