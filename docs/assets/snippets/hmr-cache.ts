import { connectHmr, devFetch, withDevCache, withNoCache } from "@kikojs/hmr"

// 前端 GET：开发模式下自动带上 ?kiko-dev=<时间戳> 并声明 cache: "no-store"，
// 浏览器 / Service Worker / 反向代理都不会把旧响应还回来。
// NODE_ENV=production（bundler 静态替换）时与原生 fetch 完全一致。
const board = await devFetch("/api/board")

// 开发服务器返回的 HTML / JS / CSS 按资源类型给缓存策略：
// - HTML 导航响应 → no-store（旧壳引用旧资源是开发期最典型的「改了没生效」）
// - 未带内容 hash 的 js / css / vendor → no-cache（回源校验，有 etag 时 304）
// - 文件名带内容 hash（app-9f8e7d6c.js、index-00000000111d3582.js）→ 一年 immutable
Bun.serve({
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === "/") {
      const shell = `<!doctype html><html><body><div id="app"></div></body></html>`
      return withDevCache(
        new Response(shell, { headers: { "content-type": "text/html; charset=utf-8" } }),
        { url: request.url },
      )
    }

    const asset = await Bun.file(`./public${url.pathname}`)
    return withDevCache(
      new Response(asset, { headers: { "content-type": "text/javascript" } }),
      { url: request.url },
    )
  },
})

// 需要更严格时：kind 显式指定，或整段强制 no-store。
withDevCache(new Response("a{}", { headers: { "content-type": "text/css" } }), {
  url: "/styles/site.css",
  kind: "no-store", // "no-store" | "revalidate" | "immutable"
})

// API JSON 之类不需要协商的内容直接用 withNoCache（no-store + pragma + expires）。
const api = withNoCache(Response.json({ ok: true }))

// HMR 端点连接默认按 NODE_ENV 判定是否携带时间戳参数；也可以显式开关。
const client = connectHmr({ url: "/hmr", cacheBust: true })

client.close()
