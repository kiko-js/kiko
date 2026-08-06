import { join } from "node:path"

const entry = join(import.meta.dir, "src", "client.tsx")
const distDir = join(import.meta.dir, "dist")

await Bun.build({
  entrypoints: [entry],
  outdir: distDir,
  target: "browser",
  format: "esm",
  splitting: true,
  jsx: {
    runtime: "automatic",
    importSource: "@kikojs/dom",
  },
})

console.log("client bundle built -> dist/")
