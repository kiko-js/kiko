/** @jsxImportSource @kikojs/dom */
import { renderToFragment } from "@kikojs/dom/server"
import { App } from "./src/App"

const PORT = Number(process.env.PORT || "3000")

// @kikojs/dom/server 入口在模块加载时注册 SSR 运行时；此后组件树的 jsx/
// Show/For/Suspend 全部产出字符串。客户端 bundle 不引用该入口，保持纯净。
//
// 页面骨架（html/head/body）由 server 组装，组件树用 renderToFragment 渲染进
// #root——便于注入水合脚本。若组件树自带 <html> 骨架，可直接用 renderToDocument。
// 服务常驻运行；句柄不变量化，避免 unused 警告
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

    if (url.pathname === "/") {
      const content = await renderToFragment(() => <App />)
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>kiko SSR + 水合</title>
  </head>
  <body>
    <div id="root">${content}</div>
    <script type="module" src="/client.js"></script>
  </body>
</html>`
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`SSR demo running at http://localhost:${PORT}`)
