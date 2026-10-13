/**
 * 纯前端 SPA 的 Bun 开发服务器。
 *
 * - `import html from "./index.html"` 让 Bun 在请求时打包页面（转译 TSX、解析
 *   `@kikojs/*` 依赖），开发模式下每次请求重新打包并带 sourcemap。
 * - `development: { hmr: true }` 打开 Bun 打包器 HMR：编辑 `src/` 下的模块，
 *   改写后的组件模块通过 `import.meta.hot.accept` 拿到新实现，kiko 注册表原
 *   位热替换组件并保留状态，浏览器不整页刷新。
 * - `createBunHmr()` 挂上独立端点 `/hmr`：插件注入的客户端会连它。纯前端项目
 *   里模块替换由 Bun 打包器负责（`managed`），端点的 `update` 对这类模块不生效；
 *   保留端点是为了让客户端有一条稳定连接，也给非 Bun 宿主留出接入点（那时给它
 *   加 `watch` 即可由端点按模块 URL 重新导入）。
 */
import html from "./index.html"
import { createBunHmr } from "@kikojs/hmr/bun"

const PORT = Number(process.env.PORT || "3003")

const hmr = createBunHmr()

Bun.serve({
  port: PORT,
  development: {
    // Bun 打包器 HMR（浏览器侧不整页刷新）。
    hmr: true,
    // 浏览器 console 回显到终端。
    console: true,
  },
  routes: {
    "/hmr": (request, server) => hmr.fetch(request, server) ?? new Response(null, { status: 404 }),
    // SPA 深链接（如 /settings/profile 直接刷新）也回落同一份 HTML。
    "/*": html,
  },
  websocket: hmr.websocket,
})

console.log(`kiko SPA HMR demo running at http://localhost:${PORT} (endpoint: /hmr)`)
