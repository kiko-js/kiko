/**
 * 生产构建：把 index.html 及其引用的 TSX/CSS 打成静态文件到 dist/，
 * 交给任意静态托管即可（GitHub Pages / Nginx / CDN）。
 */
import { join } from "node:path"

await Bun.build({
  entrypoints: [join(import.meta.dir, "index.html")],
  outdir: join(import.meta.dir, "dist"),
  target: "browser",
  format: "esm",
  splitting: false,
})

console.log("built to examples/spa/dist")
