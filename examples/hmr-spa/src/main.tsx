/** @jsxImportSource @kikojs/dom */
import { render } from "@kikojs/dom"
import { App } from "./app"

// 客户端入口：整个 SPA 挂到 #app。入口模块本身不是组件模块，不参与热替换；
// 编辑它会整页刷新（见下面的 accept 边界说明）。
render(<App />, document.getElementById("app")!)

// 入口自身也是 accept 边界：Bun 的 HMR 图里包含 workspace 中经 tsconfig `paths`
// 解析的框架源码（`../../packages/dom/src/*`），这些模块在项目根之外，任何一次
// 更新都会被标记为「未接受」并把整页刷新冒泡到入口。给入口一个空 accept 回调，
// 冒泡到此为止：组件模块仍由各自的 accept 回调原位热替换、状态保留。
if (import.meta.hot) {
  import.meta.hot.accept(() => {})
}
