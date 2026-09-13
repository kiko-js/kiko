import html from "./index.html"
import { createBunHmr } from "@kikojs/hmr/bun"

const PORT = Number(process.env.PORT || "3003")

// 独立 HMR 端点：GET /hmr → SSE，Upgrade: websocket → WebSocket。
// watcher 监听 src/ 的变化并 publish（模块 id 与打包插件一致）。
const hmr = createBunHmr({ watch: ["src"], debounceMs: 30 })

Bun.serve({
  port: PORT,
  development: {
    // Bun 自带 HMR（模块替换）+ 终端回显；独立端点负责通知 / 非 Bun 宿主。
    hmr: true,
    console: true,
  },
  routes: {
    "/hmr": (request, server) => hmr.fetch(request, server) ?? new Response(null, { status: 404 }),
    "/*": html,
  },
  websocket: hmr.websocket,
})

console.log(`HMR demo running at http://localhost:${PORT} (endpoint: /hmr)`)
