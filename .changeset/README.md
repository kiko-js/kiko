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
2. When ready to release: manually trigger the "Release" workflow in GitHub Actions
3. The workflow auto-generates a changeset and creates/updates a "Version Packages" PR
4. Merge that PR → CI publishes to npm and creates a GitHub release

## Manual release (if needed)

```bash
bun run version-packages  # bump versions from changesets
bun run release            # publish to npm
```
