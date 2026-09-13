import { createHmrHub, type HmrSink } from "@kikojs/hmr"

// 核心 Hub 是纯 Fetch API：不解析请求路径、不依赖任何框架。
// 挂到哪个路由、用什么服务器，全部由宿主决定。
const hub = createHmrHub({
  heartbeatMs: 15000,
  onMessage(message) {
    console.log("client said", message)
  },
})

// 任何 Fetch API 宿主（Deno / Cloudflare Workers / Node 18+ ...）
export default {
  fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/hmr") return hub.handle(request)
    return Promise.resolve(new Response("Not Found", { status: 404 }))
  },
}

// WebSocket 等长连接：把 socket 包成 sink 即可接入同一广播。
const sink: HmrSink = { send: data => console.log(data) }
const unsubscribe = hub.subscribe(sink)

// 更新事件由宿主推入：谁检测到变化谁 publish。
hub.publish(["src/app.tsx", "src/store.ts"])
unsubscribe()
