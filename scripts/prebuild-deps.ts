/**
 * Build a package's in-repo dependency closure, in topological order.
 *
 * Why this exists: `tsconfig.build.json` for @kikojs/dom and @kikojs/router
 * resolves cross-package imports to ALREADY-BUILT declarations
 * (`../hmr/dist/index.d.ts`, `../dom/dist/index.d.ts`, ...) rather than to
 * sources — that is deliberate, because with `rootDir: src` a source path
 * alias would pull foreign `src/` into the emit program.
 *
 * The root `bun run build` satisfies that contract by ordering packages
 * signal -> hmr -> dom -> router. But `prepublishOnly` runs per package, and
 * `changeset publish` fans out over all unpublished packages in PARALLEL
 * (concurrency 10 in @changesets/cli), each in its own cwd. So a package
 * could start emitting declarations while a dependency's `dist/` was still
 * missing or being written, failing with:
 *
 *   src/router.ts(2,38): error TS2307: Cannot find module '@kikojs/signal'
 *
 * Which package lost was a race — the symptom was "one package publishes per
 * run", because each re-run dropped the already-published winner from the
 * pool until someone finally built alone.
 *
 * So `prepublishOnly` must NOT rely on the caller's build order: this script
 * builds the package's own in-repo dependencies first, each in isolation and
 * in dependency order, making every publish path self-sufficient. Packages
 * with no in-repo deps (signal, hmr) build nothing here and skip straight to
 * their own build.
 *
 * Usage (cwd = the package directory):  bun ../../scripts/prebuild-deps.ts
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const PACKAGES_DIR = join(ROOT, "packages")

interface Manifest {
  name: string
  version: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function readManifest(dir: string): Manifest | null {
  const path = join(dir, "package.json")
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, "utf8")) as Manifest
}

/** Every workspace package, keyed by npm name. */
function loadWorkspace(): Map<string, { dir: string; manifest: Manifest }> {
  const map = new Map<string, { dir: string; manifest: Manifest }>()
  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(PACKAGES_DIR, entry.name)
    const manifest = readManifest(dir)
    if (manifest?.name) map.set(manifest.name, { dir, manifest })
  }
  return map
}

/**
 * In-repo deps that must be built before this package. Only packages that
 * actually emit declarations matter; a dependency with no `build` script has
 * nothing to produce.
 */
function inRepoDeps(manifest: Manifest): string[] {
  const names = new Set<string>()
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"] as const) {
    for (const name of Object.keys(manifest[field] ?? {})) names.add(name)
  }
  return [...names]
}

function main(): void {
  const pkgDir = process.cwd()
  const self = readManifest(pkgDir)
  if (!self) {
    console.error(`[kiko] no package.json in ${pkgDir}`)
    process.exit(1)
  }

  const workspace = loadWorkspace()

  // Depth-first topological order over in-repo deps, dependencies first.
  // `visiting` both breaks cycles and keeps the traversal honest.
  const ordered: { name: string; dir: string; manifest: Manifest }[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()

  function visit(name: string): void {
    if (done.has(name) || visiting.has(name)) return
    const entry = workspace.get(name)
    if (!entry) return // external dependency — nothing to build here
    visiting.add(name)
    for (const dep of inRepoDeps(entry.manifest)) visit(dep)
    visiting.delete(name)
    done.add(name)
    if (name !== self!.name) ordered.push({ name, ...entry })
  }

  for (const dep of inRepoDeps(self)) visit(dep)

  const buildable = ordered.filter(pkg => Boolean(pkg.manifest.scripts?.build))
  if (buildable.length === 0) {
    console.log(`[kiko] ${self.name}: no in-repo build dependencies`)
    return
  }

  for (const pkg of buildable) {
    console.log(`[kiko] building dependency ${pkg.name} for ${self.name}`)
    try {
      execFileSync("bun", ["run", "build"], {
        cwd: pkg.dir,
        stdio: "inherit",
        env: { ...process.env, FORCE_COLOR: "1" },
      })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 1
      console.error(`[kiko] dependency build failed: ${pkg.name}`)
      process.exit(status)
    }
  }
}

main()
