/**
 * 单调用 SSR（`@kikojs/dom/server`）。
 *
 * 把字符串模式的整套仪式收进一次调用：请求作用域 → 信号捕获 →
 * 渲染 → 序列化 → 状态脚本块。等价于手写
 * `withSSRScope` + `startSignalCapture` + `renderToFragment` +
 * `signalStateScript` + `stopSignalCapture`，顺序错一步就会静默丢状态，
 * 所以默认走这里；需要细粒度控制（流式、多次渲染复用一次捕获）才用底层函数。
 */
import { withSSRScope } from "./ssr-scope"
import { renderToFragment } from "./ssr"
import { signalStateScript, startSignalCapture, stopSignalCapture } from "./signal-serialize"

/** `renderToPage` 的产物：`html` 进 `<div id="root">`，`stateScript` 紧跟其后。 */
export interface RenderedPage {
  html: string
  stateScript: string
}

/**
 * 服务端渲染一页（字符串模式）：返回 HTML 与可直接嵌入的状态脚本块。
 *
 * ```ts
 * import { renderToPage } from "@kikojs/dom/server"
 *
 * app.get("/", async () => {
 *   const { html, stateScript } = await renderToPage(() => <App />)
 *   return new Response(`<div id="root">${html}</div>${stateScript}`, {
 *     headers: { "content-type": "text/html; charset=utf-8" },
 *   })
 * })
 * ```
 *
 * 请求态（cookie / 登录）仍按老 recipe：在外层读 `req.headers`、以 props
 * 传进组件树；渲染期间创建的 `createSignal(会话派生初值)` 会被一并捕获。
 */
export async function renderToPage(component: () => unknown): Promise<RenderedPage> {
  return withSSRScope(async () => {
    startSignalCapture()
    try {
      const html = await renderToFragment(component)
      return { html, stateScript: signalStateScript() }
    } finally {
      stopSignalCapture()
    }
  })
}
