/**
 * Cross-platform package build helper.
 *
 * Bundling uses **esbuild** (not bun's bundler) and declarations use the
 * TypeScript compiler (tsc). We deliberately avoid bun's bundler for the
 * split build: bun 1.4 emits a broken re-export facade for barrel entries
 * under "splitting: true" (references undeclared identifiers), which already
 * shipped broken dists (e.g. @kikojs/router). esbuild's code splitting
 * emits proper re-export chunk facades, so entries like @kikojs/dom and
 * @kikojs/dom/jsx-runtime share ONE runtime chunk - no duplicated module
 * state, so delegated events fire and render()'s dispose cleans up watchers.
 *
 * Uses only Node APIs - no shell commands (rm -rf, cp, ...) - so the same
 * script runs on Linux, macOS and Windows. Run via a per-package build.ts
 * (cwd = package directory). bun stays the runner/package-manager; only the
 * compile step is esbuild + tsc, so bun's own bundler bug never applies.
 *
 *   bun run build   # == bun build.ts -> buildPackage(...)
 *
 * Steps: clean dist/, bundle all entry points to ESM with esbuild, then emit
 * .d.ts declarations with tsc.
 */

import { rm } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { build } from "esbuild"

const require = createRequire(import.meta.url)

export interface BuildOptions {
  /** Entry points, relative to the package dir (e.g. src/index.ts). */
  entrypoints: string[]
  /** Packages left unbundled (peer/runtime deps). */
  external?: string[]
  /** Code-splitting into chunks; defaults to "true" (shared deps extracted). */
  splitting?: boolean
}

/** A Node host to run tsc under: prefer node, fall back to the current binary. */
function tscHost(): string {
  try {
    execFileSync("node", ["--version"], { stdio: "ignore" })
    return "node"
  } catch {
    return process.execPath
  }
}

export async function buildPackage(opts: BuildOptions): Promise<void> {
  await rm("dist", { recursive: true, force: true })

  let result
  try {
    result = await build({
      entryPoints: opts.entrypoints,
      outdir: "dist",
      bundle: true,
      format: "esm",
      platform: "browser",
      target: ["es2020"],
      // Extract modules shared between entry points into chunks instead of
      // duplicating them per entry (e.g. dom's jsx core is used by 3 entries).
      // esbuild emits proper re-export facades, so this is single-instance.
      splitting: opts.splitting ?? true,
      minify: true,
      external: opts.external,
      // Automatic JSX runtime for @kikojs/router's components.tsx; inert for
      // the other packages (no .tsx). The runtime import stays external.
      jsx: "automatic",
      jsxImportSource: "@kikojs/dom",
      metafile: true,
    })
  } catch (err) {
    const errors = (err as { errors?: { text: string }[] }).errors
    if (errors && errors.length) for (const e of errors) console.error(e.text)
    else console.error(err)
    process.exit(1)
  }

  const outputs = result.metafile ? result.metafile.outputs : {}
  for (const path of Object.keys(outputs).sort()) {
    const bytes = outputs[path].bytes
    console.log("  " + path + "  " + (bytes / 1024).toFixed(2) + " KB")
  }

  // Emit .d.ts per source file. TypeScript 7 has an `exports` map that blocks
  // `require.resolve("typescript/bin/tsc")`, so resolve the physical path from
  // the package root (`require.resolve("typescript")` -> lib/, then ../bin/tsc).
  const tscBin = resolve(dirname(require.resolve("typescript")), "..", "bin", "tsc")
  const host = tscHost()
  try {
    execFileSync(host, [tscBin, "-p", "tsconfig.build.json"], { stdio: "inherit" })
  } catch (err) {
    process.exit((err as { status?: number }).status || 1)
  }
}
