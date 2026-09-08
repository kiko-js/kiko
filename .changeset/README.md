# Changesets

This repo uses [changesets](https://github.com/changesets/changesets) to manage versioning and publishing.

## Auto-generating changesets from commits

Changesets are **automatically generated** from conventional commits. The `bun run auto-changeset` script:

1. Scans commits since the last release tag
2. Parses [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, etc.)
3. Maps changed files to packages (`packages/signal` → `@kikojs/signal`, etc.)
4. Determines bump level (`feat` → minor, `fix` → patch, `BREAKING CHANGE` → major)
5. Generates a `.changeset/auto-*.md` file

### Commit message format

```
<type>(<scope>): <subject>

[body]

BREAKING CHANGE: <description>
```

Types:

- `feat` → minor bump
- `fix` → patch bump
- `refactor`, `perf`, `docs`, `style`, `test`, `chore`, `ci`, `build` → patch bump
- `BREAKING CHANGE` in body or `!` after type → major bump

## Releasing

1. Push to `main` → CI runs quality gates (lint/typecheck/test) only
2. When ready to release: manually dispatch the "Release PR" workflow in GitHub Actions
3. The workflow auto-generates a changeset, bumps versions, and opens/updates the `chore: release` PR (CI gates it like any PR — merge only when green, squash-merge keeps the `chore: release` title so `auto-changeset` can anchor on it)
4. Merge that PR → the "Publish" workflow auto-publishes to npm (OIDC trusted publishing) and creates a GitHub release

## Manual release (if needed)

```bash
bun run version-packages  # bump versions from changesets
bun run release            # publish to npm
```
