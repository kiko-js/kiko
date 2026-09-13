import { createServer } from "node:http"
import { createNodeHmr, toNodeListener } from "@kikojs/hmr/node"

// Node 接入：通用 Hub + node:http 桥接；watch 自动监听 src/。
const hmr = createNodeHmr({ watch: ["src"] })

createServer(
  toNodeListener(hmr, {
    // 非 /hmr 的请求交回自己的静态资源 / 上层框架
    fallback: (_request, response) => {
      response.statusCode = 404
      response.end("Not Found")
    },
  }),
).listen(3000)

// WebSocket（可选，零依赖绑定）：把 ws 的 socket 接进同一 Hub
// import { WebSocketServer } from "ws"
// const wss = new WebSocketServer({ server })
// wss.on("connection", socket => hmr.bindSocket(socket))

// 也可以只用纯 Fetch API：Node 18+ / Hono / 其它 fetch 框架
const response = await hmr.fetch(new Request("http://localhost:3000/hmr"))
console.log(response?.status)
hmr.publish("src/app.tsx")
