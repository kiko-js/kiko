# Changesets

This repo uses [changesets](https://github.com/changesets/changesets) to manage versioning and publishing.

## Adding a changeset

After making a changeset, run:

```bash
bun changeset
```

This will prompt you for:

- Which packages to bump (major/minor/patch)
- A summary of the change (written to the changelog)

## Releasing

The release process is automated via GitHub Actions:

1. When a PR with changesets is merged to `main`, the action creates/updates a "Version Packages" PR
2. When that PR is merged, the action publishes to npm and creates a GitHub release

## Manual release (if needed)

```bash
bun run version-packages  # bump versions from changesets
bun run release            # publish to npm
```
