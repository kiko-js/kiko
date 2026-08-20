/**
 * Cross-platform package build helper.
 *
 * Uses only Node/Bun APIs — no shell commands (`rm -rf`, `cp`, …) — so the
 * same script runs on Linux, macOS and Windows. Run via a per-package
 * `build.ts` (cwd = package directory).
 *
 *   bun run build   # == bun build.ts → buildPackage(...)
 *
 * Steps: clean `dist/`, bundle all entry points to ESM, then emit `.d.ts`
 * declarations with `tsc` (spawned through `bun x`, which resolves the
 * local `node_modules/.bin` entry on every platform).
 */

import { rm } from "node:fs/promises"
import { build } from "bun"

export interface BuildOptions {
  /** Entry points, relative to the package dir (e.g. `src/index.ts`). */
  entrypoints: string[]
  /** Packages left unbundled (peer/runtime deps). */
  external?: string[]
  /** Build target; defaults to `browser`. */
  target?: "browser" | "node"
  /** Minify output; defaults to `true`. */
  minify?: boolean
  /** Code-splitting into chunks; defaults to `true` (shared deps extracted). */
  splitting?: boolean
}

export async function buildPackage(opts: BuildOptions): Promise<void> {
  await rm("dist", { recursive: true, force: true })
  const result = await build({
    entrypoints: opts.entrypoints,
    outdir: "dist",
    target: opts.target ?? "browser",
    format: "esm",
    // Extract modules shared between entry points into chunks instead of
    // duplicating them per entry (e.g. dom's jsx core is used by 3 entries).
    splitting: opts.splitting ?? true,
    // Published artifacts are minified; consumers re-bundle from dist anyway.
    minify: opts.minify ?? true,
    external: opts.external,
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  for (const output of result.outputs) {
    const kb = (output.size / 1024).toFixed(2)
    console.log(`  ${output.path}  ${kb} KB`)
  }

  // Emit .d.ts per source file. `bun x` finds the local tsc (root devDep)
  // without relying on platform-specific .bin shims.
  const tsc = Bun.spawn(["bun", "x", "tsc", "-p", "tsconfig.build.json"], {
    stdio: ["ignore", "inherit", "inherit"],
  })
  const status = await tsc.exited
  if (status !== 0) process.exit(status ?? 1)
}
