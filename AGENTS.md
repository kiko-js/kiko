# Repository Guidelines

## Project Overview

**kiko** is a reactive DOM library built on `signal-polyfill` (TC39 Signals proposal). Custom JSX runtime compiles to real DOM nodes (no virtual DOM, no reconciliation). Component functions execute **exactly once** — signals create per-binding watchers for fine-grained updates.

Monorepo: `@kikojs/signal` (signal toolkit), `@kikojs/dom` (DOM + SSR), `@kikojs/router` (router). `@kikojs/dom` is self-contained (re-implements signal wrappers over `signal-polyfill`, does not depend on `@kikojs/signal`).

## Core Constraints

### Signal Compatibility

- `createSignal<T>()` returns plain `Signal.State<T>`; `computed`/`derived` return `Signal.Computed<T>`. Standard TC39 interface — no brand symbols.
- `createSignal` is instrumented for SSR signal serialization (capture/restore modes). Don't break the global ordering contract.

### Architecture Invariants

- **No re-render cycle**: Component functions run once. Signals in children/props create watchers; signal children resolving to `Node`/array trigger marker-anchored subtree swaps.
- **Cleanup is recursive**: `WeakMap<Node, Set<Watcher>>`-based. Uses `Signal.subtle.introspectSources` (not `watcher.unwatch()` with no args — that's a no-op in signal-polyfill v0.2).
- **SSR ↔ Client alignment**: Hydration relies on `PendingNode` lazy alignment (adoption order == document order). Signal creation order must match between server and client.

### TypeScript

- Strict mode: `noUncheckedIndexedAccess`, `noImplicitOverride`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- Module resolution: `bundler` (Bun-native)
- JSX: `react-jsx` with `jsxImportSource: "@kikojs/dom"`

### Code Style

- `camelCase` variables/functions, `PascalCase` components/types, `kebab-case.ts` files
- Lint: `oxlint .`, Format: `oxfmt --write .`

### Testing

- Framework: `bun:test` (Jest-compatible API)
- DOM: `happy-dom` v17 (injected via `test/setup.ts`)
- JSX tests need `/** @jsxImportSource @kikojs/dom */` pragma
- DOM tests: `beforeAll(async () => { await import('./setup') })`

### Release

- Changesets auto-generated from conventional commits (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE` → major)
- Push to main → CI creates release PR → merge to publish

## Constraints

- **NEVER hand-edit `bun.lock`** — all dependency changes via `bun install` / `bun add` / `bun remove` / `bun update`
