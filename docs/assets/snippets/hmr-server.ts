import { createBunHmr } from "@kikojs/hmr/bun"

// 核心不认识路径：/hmr 由适配器决定（path 可改）。
// watch 打开后自动监听 src/，把变化文件 publish 给所有客户端。
const hmr = createBunHmr({ watch: ["src"], debounceMs: 30 })

Bun.serve({
  fetch(request, server) {
    // GET /hmr → SSE；Upgrade: websocket → WebSocket；
    // 其它路径返回 undefined，交回宿主自己的路由。
    return hmr.fetch(request, server) ?? new Response("Not Found", { status: 404 })
  },
  websocket: hmr.websocket,
})

// 也可以不用 watcher，由任意构建流程手动推送：
hmr.publish("src/counter.tsx")
hmr.reload("module graph changed")
