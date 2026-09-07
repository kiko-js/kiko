/** @jsxImportSource @kikojs/dom */
import { renderToPage, renderToStream, withSSRScope } from "@kikojs/dom/server"
import { App } from "./src/App"

const PORT = Number(process.env.PORT || "3000")

// @kikojs/dom/server 入口在模块加载时注册 SSR 运行时；此后组件树的 jsx/
// Show/For/Suspend 全部产出字符串。客户端 bundle 不引用该入口，保持纯净。
//
// Bun.serve 的 fetch 是并发的，每个请求必须包进 withSSRScope()：SSR 运行时
// 槽与信号捕获/恢复状态都按请求隔离（AsyncLocalStorage），否则并发请求互相
// 污染。串行脚本可以省略这一层。
function pageHead(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>kiko SSR + 水合</title>
  </head>
  <body>
    <div id="root">`
}

function pageTail(stateScript = ""): string {
  return `</div>
    ${stateScript}
    <script type="module" src="/client.js"></script>
  </body>
</html>`
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/client.js") {
      const file = Bun.file(new URL("./dist/client.js", import.meta.url))
      return new Response(file, {
        headers: { "content-type": "text/javascript" },
      })
    }

    // 字符串模式：一句话渲染 + 信号状态嵌入。renderToPage 内部包了
    // withSSRScope + startSignalCapture + renderToFragment + signalStateScript，
    // 客户端 hydrate() 恢复后初始值与服务端快照一致。
    // 请求态（cookie / 登录）recipe：渲染器本身是匿名的，拿不到 cookie——
    // 在调用前先读 req.headers，以 props 传进组件树；渲染期间创建的
    // createSignal(会话派生初值) 会被信号捕获一并序列化，客户端水合后首帧即
    // 登录态、无闪烁。请求相关状态不要放模块级 signal（跨请求污染，且创建于
    // 捕获窗口之外、不会被序列化）。如：
    //   const session = parseSession(req.headers.get("cookie"))
    //   const { html, stateScript } = await renderToPage(() => <App session={session} />)
    if (url.pathname === "/") {
      const { html, stateScript } = await renderToPage(() => <App />)
      return new Response(pageHead() + html + pageTail(stateScript), {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }
    // 流式不嵌入信号状态：hydrate() 找不到 kiko-state 脚本块时
    // 自动按客户端初始值水合。
    if (url.pathname === "/stream") {
      return withSSRScope(() => {
        const content = renderToStream(() => <App />, { signal: req.signal })
        // 流式只能追加、无法回溯：骨架 head 立即 flush（低 TTFB），组件树流
        // 接在其后，收尾补 tail。断开时 cancel 透传给渲染器停止渲染。
        const shell = new ReadableStream<string>({
          async start(controller) {
            controller.enqueue(pageHead())
            try {
              const reader = content.getReader()
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                controller.enqueue(value)
              }
              controller.enqueue(pageTail())
              controller.close()
            } catch (e) {
              controller.error(e)
            }
          },
          cancel(reason) {
            content.cancel(reason)
          },
        })
        return new Response(shell, {
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      })
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`SSR demo running at http://localhost:${PORT}`)
console.log("  /       字符串模式：全量渲染 + 信号状态嵌入（kiko-state）")
console.log("  /stream 流式模式：同步骨架先发，Suspend 内容 resolve 后补发")
