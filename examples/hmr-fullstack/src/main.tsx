/** @jsxImportSource @kikojs/dom */
import { render } from "@kikojs/dom"
import { App } from "./app"

// 客户端入口：数据全部来自服务端 API（`/api/*`），服务端不参与这段渲染。
render(<App />, document.getElementById("app")!)

// 入口自身是 accept 边界：Bun 的 HMR 图包含 workspace 里经 tsconfig `paths` 解析的
// 框架源码（`../../packages/dom/src/*`），位于项目根之外，更新时会被标记为「未接受」
// 并把整页刷新冒泡到入口。空 accept 回调让冒泡到此为止——客户端组件仍由各自的
// accept 回调原位热替换、状态保留；服务端文件变化走 `/hmr` 端点的 reload（见 server.tsx）。
if (import.meta.hot) {
  import.meta.hot.accept(() => {})
}
