/**
 * Build kiko documentation site.
 * Requires bun >= 1.x, run from repo root.
 *
 *   bun run docs/build.ts
 */

import { mkdir } from "node:fs/promises"

const dist = "dist"
const docs = "docs"

// Clean and recreate output directory
await Bun.$`rm -rf ${dist}`
await mkdir(dist, { recursive: true })

// Build HTML entrypoints — Bun resolves script/link tags, bundles TS/JS/CSS
const htmlEntries = ["index.html", "signal.html", "dom.html", "router.html", "api.html", "examples.html"]
const result = await Bun.build({
  entrypoints: htmlEntries.map((f) => `${docs}/${f}`),
  outdir: dist,
  target: "browser",
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

for (const output of result.outputs) {
  const kb = (output.size / 1024).toFixed(2)
  console.log(`  ${output.path}  ${kb} KB`)
}

// Copy runtime assets not picked up by the bundler (loaded via fetch())
await mkdir(`${dist}/assets/snippets`, { recursive: true })
await Bun.$`cp -r ${docs}/assets/snippets/. ${dist}/assets/snippets/`
console.log("==> Site build complete")
