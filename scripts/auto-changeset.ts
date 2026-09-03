/**
 * 根据 git 提交自动生成 changeset。
 *
 * 用法：bun run scripts/auto-changeset.ts [--since <ref>] [--dry-run]
 *
 * 默认从最新 tag 开始扫描提交，解析 conventional commits (feat/fix/refactor...)
 * 并按包路径分组，生成一个 changeset 文件。
 */

import { execSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = execSync("git rev-parse --show-toplevel").toString().trim()

// 包路径 → 包名映射
const PACKAGE_PATHS: Record<string, string> = {
  "packages/signal": "@kikojs/signal",
  "packages/dom": "@kikojs/dom",
  "packages/router": "@kikojs/router",
}

// conventional commit 类型 → changeset bump 级别
const BUMP_LEVELS: Record<string, "major" | "minor" | "patch"> = {
  feat: "minor",
  fix: "patch",
  refactor: "patch",
  perf: "patch",
  docs: "patch",
  style: "patch",
  test: "patch",
  chore: "patch",
  ci: "patch",
  build: "patch",
  revert: "patch",
  breaking: "major",
}

interface Commit {
  hash: string
  type: string
  scope: string | null
  subject: string
  body: string
  breaking: boolean
}

function getSinceRef(): string {
  const argIdx = process.argv.indexOf("--since")
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1]!
  }
  // 找最新 tag
  try {
    return execSync("git describe --tags --abbrev=0").toString().trim()
  } catch {
    // 没有 tag，返回第一个 commit
    return execSync("git rev-list --max-parents=0 HEAD").toString().trim()
  }
}

function getCommits(since: string): string[] {
  const range = since === "HEAD" ? "HEAD" : `${since}..HEAD`
  const out = execSync(`git log ${range} --format="%H" --no-merges`).toString().trim()
  return out ? out.split("\n") : []
}

function parseCommit(hash: string): Commit | null {
  const raw = execSync(`git log -1 --format="%B" ${hash}`).toString().trim()
  const lines = raw.split("\n")
  const subject = lines[0] ?? ""

  // conventional commit 正则
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/)
  if (!match) return null

  const [, type, scope, breakingMark, restSubject] = match
  const body = lines.slice(1).join("\n").trim()

  // 检查 BREAKING CHANGE
  const breaking =
    breakingMark === "!" || body.includes("BREAKING CHANGE:") || body.includes("BREAKING-CHANGE:")

  return {
    hash,
    type: type!.toLowerCase(),
    scope: scope ?? null,
    subject: restSubject!.trim(),
    body,
    breaking,
  }
}

function getChangedFiles(hash: string): string[] {
  const out = execSync(`git diff-tree --no-commit-id --name-only -r ${hash}`).toString().trim()
  return out ? out.split("\n") : []
}

function detectPackage(file: string): string | null {
  for (const [pkgPath, pkgName] of Object.entries(PACKAGE_PATHS)) {
    if (file.startsWith(pkgPath + "/")) return pkgName
  }
  return null
}

function bumpLevel(commit: Commit): "major" | "minor" | "patch" {
  if (commit.breaking) return "major"
  return BUMP_LEVELS[commit.type] ?? "patch"
}

function generateChangeset(commits: Commit[]): string {
  // 按包分组，取最高 bump 级别
  const pkgBumps = new Map<string, "major" | "minor" | "patch">()
  const pkgCommits = new Map<string, Commit[]>()

  for (const commit of commits) {
    const files = getChangedFiles(commit.hash)
    const pkgs = new Set(files.map(detectPackage).filter((p): p is string => p !== null))

    for (const pkg of pkgs) {
      const current = pkgBumps.get(pkg)
      const newLevel = bumpLevel(commit)
      if (!current || levelRank(newLevel) > levelRank(current)) {
        pkgBumps.set(pkg, newLevel)
      }
      const list = pkgCommits.get(pkg) ?? []
      list.push(commit)
      pkgCommits.set(pkg, list)
    }
  }

  if (pkgBumps.size === 0) return ""

  // 生成 changeset 内容
  const frontmatter: string[] = []
  for (const [pkg, level] of pkgBumps) {
    frontmatter.push(`"${pkg}": ${level}`)
  }

  const lines: string[] = []
  for (const [pkg, level] of pkgBumps) {
    const commitsForPkg = pkgCommits.get(pkg) ?? []
    lines.push(`### ${pkg} (${level})`)
    for (const c of commitsForPkg) {
      const scope = c.scope ? `**${c.scope}**: ` : ""
      lines.push(`- ${scope}${c.subject} (${c.hash.slice(0, 7)})`)
    }
    lines.push("")
  }

  return `---\n${frontmatter.join("\n")}\n---\n\n${lines.join("\n")}\n`
}

function levelRank(level: "major" | "minor" | "patch"): number {
  return level === "major" ? 3 : level === "minor" ? 2 : 1
}

function main() {
  const dryRun = process.argv.includes("--dry-run")
  const since = getSinceRef()
  console.log(`Scanning commits since: ${since}`)

  const commits = getCommits(since)
  if (commits.length === 0) {
    console.log("No commits found.")
    return
  }

  const parsed: Commit[] = []
  for (const hash of commits) {
    const commit = parseCommit(hash)
    if (commit) parsed.push(commit)
  }

  if (parsed.length === 0) {
    console.log("No conventional commits found.")
    return
  }

  const changeset = generateChangeset(parsed)
  if (!changeset) {
    console.log("No package changes detected.")
    return
  }

  if (dryRun) {
    console.log("--- DRY RUN ---")
    console.log(changeset)
    return
  }

  // 写入 changeset 文件
  const filename = `auto-${Date.now()}.md`
  const filepath = join(ROOT, ".changeset", filename)
  writeFileSync(filepath, changeset, "utf8")
  console.log(`Changeset written to: .changeset/${filename}`)
}

main()
