/**
 * 生产构建：把 index.html 及其引用的 TSX/CSS 打成静态文件到 dist/，交给任意
 * 静态托管（GitHub Pages / Nginx / CDN）。
 *
 * 这里不加载 HMR 插件：源码保持原样，产物里没有 HMR 粘合。`define` 把
 * `process.env.NODE_ENV` 定成 `"production"`——框架内部（`createSignal` 的 HMR
 * 复用钩子等）靠这个裸字面量做构建期 DCE，否则运行时会带着注册表代码。
 */
import { join } from "node:path"

await Bun.build({
  entrypoints: [join(import.meta.dir, "index.html")],
  outdir: join(import.meta.dir, "dist"),
  target: "browser",
  format: "esm",
  splitting: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
})

console.log("built to examples/hmr-spa/dist")
