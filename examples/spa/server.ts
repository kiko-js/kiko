/**
 * Bun 开发服务器：`import html from "./index.html"` 让 Bun 在启动时打包
 * 页面（转译 TSX、解析 @kikojs/* 依赖），并给打包产物加上带 hash 的资源
 * 路径。routes 的 "/*" 让任意路径都回同一份 HTML —— SPA 深链接
 * （如 /users/42 直接刷新）也能命中，不会 404。
 */
import html from "./index.html"

const port = Number(process.env.PORT ?? "3000")

Bun.serve({
  port,
  routes: {
    "/*": html,
  },
})

console.log(`kiko SPA running at http://localhost:${port}`)
