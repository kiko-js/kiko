/**
 * Publish guard: refuse to publish a package whose runtime dependency ranges
 * still use the `workspace:` protocol (npm ships package.json verbatim).
 *
 * Neither `changeset version` nor `changeset publish` (npm path) rewrites the
 * protocol: bare `workspace:*`/`^`/`~` are skipped entirely by
 * apply-release-plan, and versioned `workspace:^x.y.z` keeps its prefix.
 * So published runtime deps MUST be plain semver ranges (`^x.y.z`) — bun
 * still links them to the local workspace when the range is satisfied, and
 * `updateInternalDependencies` keeps them in sync on every release.
 * Previously a `workspace:*` leak forced consumers to vendor `dist/`.
 *
 * Runs in `prepublishOnly` (cwd = the package dir), so every publish path —
 * `changeset publish`, manual `npm publish`/`bun publish` — is covered.
 * Only runtime fields are checked: `devDependencies` never affect consumers.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const pkgPath = resolve(process.cwd(), "package.json")
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const bad: string[] = []
for (const field of ["dependencies", "peerDependencies", "optionalDependencies"] as const) {
  for (const [name, range] of Object.entries(pkg[field] ?? {})) {
    if (typeof range === "string" && range.includes("workspace:")) {
      bad.push(`${field}.${name}: ${range}`)
    }
  }
}

if (bad.length > 0) {
  console.error(
    `[kiko] refusing to publish ${pkg.name}: unresolved workspace: ranges\n` +
      bad.map(entry => `  - ${entry}`).join("\n") +
      `\nPublish only from a tree versioned by the release PR ('changeset version').`,
  )
  process.exit(1)
}

console.log(`[kiko] publish guard ok: ${pkg.name}`)
