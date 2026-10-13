/**
 * 全栈 HMR 开发服务器（Bun 运行时）——一个进程里同时装下前后端：
 *
 * - **前端**：`import html from "./index.html"` 让 Bun 打包 `src/` 下的客户端
 *   代码；`development: { hmr: true }` 打开打包器 HMR——保存组件文件，浏览器
 *   原位热替换、状态保留（和纯前端示例同一套机制，见 examples/hmr-spa）。
 * - **后端**：`/api/*` 路由由 `src/server/` 下的**仅服务端**模块实现，浏览器
 *   bundle 里不含这些代码。
 * - **服务端热重载**：dev 脚本是 `bun --hot server.tsx`。保存服务端模块后 Bun
 *   重新求值模块图（不重启进程、不换端口），`Bun.serve` 的处理器换成新代码，
 *   API 立刻返回新行为。
 *
 * 服务端模块不在浏览器 bundle 里，打包器 HMR 看不到它们——所以这里再挂一个文件
 * 监听：服务端模块 / `server.tsx` / HTML 骨架变化时，通过独立 `/hmr` 端点广播
 * `reload`，浏览器整页刷新，拿到新的 HTML 与 API 行为。这就是「全栈」的另一半。
 */
import { join } from "node:path"
import html from "./index.html"
import { createBunHmr } from "@kikojs/hmr/bun"
import { createPathWatcher } from "@kikojs/hmr/watcher"
import { createTodo, getBoard, toggleTodo } from "./src/server/api"

const PORT = Number(process.env.PORT || "3004")

interface DevHmr {
  hmr: ReturnType<typeof createBunHmr>
  stopWatching: () => void
}

/**
 * `bun --hot` 会重新求值本模块，但保留 `globalThis`：Hub 与 watcher 只创建一次。
 * 否则每保存一次就叠一套监听——旧的 SSE 连接仍在广播，同一次保存会触发多次刷新。
 */
const globalStore = globalThis as typeof globalThis & { __kikoFullstackHmr?: DevHmr }

function createDevHmr(): DevHmr {
  const hmr = createBunHmr({ path: "/hmr" })
  const stopWatching = createPathWatcher({
    // 只监听「浏览器看不到」的文件：服务端模块、服务端入口、HTML 骨架。
    // 客户端模块交给打包器 HMR，不在这里整页刷新。
    roots: [
      join(import.meta.dir, "src", "server"),
      join(import.meta.dir, "server.tsx"),
      join(import.meta.dir, "index.html"),
    ],
    cwd: import.meta.dir,
    include: /\.(ts|tsx|html)$/,
    debounceMs: 60,
    onChange: modules => {
      console.log(`[hmr] server changed: ${modules.join(", ")} → reload`)
      hmr.reload(`server changed: ${modules.join(", ")}`)
    },
  })
  return { hmr, stopWatching }
}

const devHmr = globalStore.__kikoFullstackHmr ?? createDevHmr()
globalStore.__kikoFullstackHmr = devHmr

Bun.serve({
  port: PORT,
  development: {
    // 浏览器侧 HMR（打包器负责替换，客户端状态保留）。
    hmr: true,
    // 浏览器 console 回显到终端。
    console: true,
  },
  routes: {
    // 后端 API：处理器来自仅服务端模块。
    "/api/board": { GET: getBoard },
    "/api/todos": { POST: createTodo },
    "/api/todos/toggle": { POST: toggleTodo },
    // 独立 HMR 端点：SSE（默认）/ WebSocket。
    "/hmr": (request, server) =>
      devHmr.hmr.fetch(request, server) ?? new Response(null, { status: 404 }),
    // 其余路径落到前端 SPA 壳。
    "/*": html,
  },
  websocket: devHmr.hmr.websocket,
})

console.log(`kiko fullstack HMR demo running at http://localhost:${PORT}`)
console.log("  /         客户端 SPA（打包器 HMR，状态保留）")
console.log("  /api/board 服务端 API（bun --hot 软重载服务端模块）")
console.log("  /hmr       独立 HMR 端点（服务端文件变化 → 广播 reload）")
