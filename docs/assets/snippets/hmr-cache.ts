import { connectHmr, devFetch, isDevMode, withNoCache } from "@kikojs/hmr"

// 前端 GET：开发模式下自动带上 ?kiko-dev=<时间戳> 并声明 cache: "no-store"，
// 浏览器 / Service Worker / 反向代理都不会把旧响应还回来。
// NODE_ENV=production（bundler 静态替换）时与原生 fetch 完全一致。
const board = await devFetch("/api/board")

// 需要自行判定时（例如只包某几个请求）：
if (isDevMode()) await devFetch("/api/board")

// 开发服务器：响应盖上 no-store / no-cache / pragma / expires。
Bun.serve({
  routes: {
    "/api/board": () => withNoCache(Response.json({ ok: true })),
    // /hmr 端点由 createBunHmr 接管，响应本身已禁用缓存。
  },
})

// HMR 端点连接（SSE / WebSocket）默认按 NODE_ENV 判定是否携带时间戳参数；
// 也可以显式开关，或注入自定义时钟。
const client = connectHmr({ url: "/hmr", cacheBust: true })

client.close()
