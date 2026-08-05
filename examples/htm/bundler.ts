import { join } from "node:path"

const entrypoint = join(import.meta.dir, "index.html")
const distDir = join(import.meta.dir, "dist")

await Bun.build({
  entrypoints: [entrypoint],
  outdir: distDir,
  target: "browser",
  format: "esm",
  splitting: false,
})
