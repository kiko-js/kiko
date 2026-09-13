import { connectHmr } from "@kikojs/hmr/client"

// 浏览器 / 任意带 EventSource 或 WebSocket 的环境。
// transport: "sse"（默认）| "ws" | "auto"（ws 优先，失败回落 sse）。
const client = connectHmr({
  transport: "auto",
  onStatus(status, transport) {
    console.log("hmr", status, transport)
  },
})

client.on("update", message => {
  console.log("modules changed", message.modules)
})
client.on("reload", message => {
  console.log("reload requested", message.reason)
  location.reload()
})

// 客户端消息（SSE 下自动改走 POST /hmr）
client.send({ type: "hello", version: 1 })

client.close()
