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
- **Marker protocol is centralized**: all comment-marker spellings (control-flow anchors, `/suspend` end marker, signal `<!---->`, scope prefixes) live in `packages/dom/src/markers.ts` — never hardcode them elsewhere; hydration alignment breaks silently on mismatch.
- **Shared engines, no forks**: `For` reconciles through `for-engine.ts` (`createForCore` — client and hydration share entry creation, reorder, and update paths; hydration only injects a `render` hook for cursor adoption); `Suspend` promise collection goes through `shared.ts` `settleChildren`; branch retention/cleanup (Show / Suspend / ErrorBoundary) goes through `branch-engine.ts` `createBranchManager` (cached fallback/static branches keep node identity, hidden retained branches are cleaned at dispose). Do not reimplement any of this per renderer.
- **SSR control flow is single-sourced**: `ssr-engine.ts` owns the chunk IR, leaf serialization (`streamValue`), and Show / For / ErrorBoundary / Suspend semantics; `ssr.ts` (string mode → `renderToFragment`) and `ssr-stream.ts` (streaming → `renderToStream`) are two walkers over one chunk tree. Element serialization stays per-mode (scoped `<Style>` needs opening-tag retro-rewriting, impossible when streaming). Never copy control-flow semantics into either walker.
- **Hydration state is single-instance**: the adoption cursor (`hydrate.ts`) and signal capture/restore (`signal-serialize.ts`) are module-level; each `hydrate()` / render is one synchronous stack — never run two hydration roots concurrently. Server-side, SSR runtime + signal capture/restore slots live behind `ssr-mode.ts`/`signal-serialize.ts` scope hooks; `@kikojs/dom/server` installs the AsyncLocalStorage request scope (`ssr-scope.ts` `withSSRScope`) — concurrent SSR requests must each run inside `withSSRScope` or state cross-contaminates.

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
- DOM: `happy-dom` v20 (injected via `test/setup.ts`)
- JSX tests need `/** @jsxImportSource @kikojs/dom */` pragma
- DOM tests: `beforeAll(async () => { await import('./setup') })`

### Development Workflow

- After finishing any code change (verified + cleaned up), commit it locally by default.
- **Do NOT `git push`** unless the user explicitly asks to push; leave commits local and report the commit hash.

### Release

- Changesets auto-generated from conventional commits (`feat:` → minor, `fix:` → patch)
- **v0 policy: `BREAKING CHANGE` is clamped to minor** (`scripts/auto-changeset.ts` bumpLevel) — 0.x releases never jump to 1.0.0; revert to major once packages reach 1.x
- Push to main → CI runs quality gates only (no release)
- Release: manually trigger "Release" workflow in GitHub Actions → auto-changeset → create release PR → merge to publish

- **NEVER hand-edit `bun.lock`** — all dependency changes via `bun install` / `bun add` / `bun remove` / `bun update`
