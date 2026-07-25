# Repository Guidelines

## Project Overview

**kiko** is a reactive DOM library built on [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill) (the TC39 Signals proposal polyfill) for fine-grained reactivity. It provides a custom JSX runtime that compiles to real DOM nodes (no virtual DOM, no reconciliation). Optional control-flow components (`Show`, `For`) and a React portal bridge sit on top of the same standard signal primitives.

The monorepo contains two packages, both depending on `signal-polyfill` directly:

- `@kikojs/signal` — signal primitives, computed/derived signals, effects with cleanup scope + error isolation, a batched scheduler, `untrack`, an `on` dep helper, and a typed event emitter
- `@kikojs/dom` — DOM library: JSX factory, render/mount, structural-reactive children, `Show`/`For` control flow, JSX type surface, and a React portal bridge

`@kikojs/dom` does **not** depend on `@kikojs/signal`; it re-implements the thin signal wrappers it needs over `signal-polyfill` so the DOM package stays self-contained. `@kikojs/signal` is the richer signal toolkit for application code.

### Signal-standard compatibility

`createSignal<T>(initial)` returns a plain `Signal.State<T>`; `computed`/`derived` return `Signal.Computed<T>`. No brand symbols, no custom accessor objects — everything is the standard TC39 Signals interface, so any library that consumes `Signal.State`/`Signal.Computed` works unchanged. The extra helpers (`batch`, `untrack`, `on`, `onCleanup`, `Show`, `For`) are purely additive and never alter how signals behave.

## Architecture & Data Flow

### Core Modules

**`packages/@kikojs/signal/src/`**

| Module         | Purpose                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `signal.ts`    | `createSignal<T>()` returns `Signal.State<T>`; `isSignal()` type-guards `State`/`Computed`      |
| `computed.ts`  | `computed<T>(fn)` / `derived<T>(fn)` return `Signal.Computed<T>`; `toSignalValue`, `watchValue` |
| `effect.ts`    | `effect(fn)` — re-runs on dependency change; batched, error-isolated, integrates cleanup scope  |
| `scope.ts`     | `onCleanup(fn)` + internal `runInScope`/`flushScope` for per-effect cleanups                    |
| `scheduler.ts` | `batch(fn)` (deferred flush), `untrack(fn)`, shared `scheduleEffect` dedup                      |
| `on.ts`        | `on(deps, fn, { defer? })` — explicit-dependency effect helper (SolidJS-style)                  |
| `emit.ts`      | `createEmitter<Events>()` / `Emitter` — typed event pipeline                                    |
| `index.ts`     | Barrel exports, plus `createWatcher()` wrapper around `Signal.subtle.Watcher`                   |

**`packages/@kikojs/dom/src/`**

| Module            | Purpose                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `signal.ts`       | Thin wrappers over `signal-polyfill` (`createSignal`, `isSignal`, `createWatcher`) — re-implemented, not imported from `@kikojs/signal` |
| `jsx-runtime.ts`  | JSX factory: `jsx()`, `jsxs()`, `jsxDEV()`, `Fragment`; signal child/prop binding; marker-based structural swap; `cleanupWatchers`      |
| `jsx-types.ts`    | `JSX` namespace (`IntrinsicElements` for HTML+SVG, `Element`, etc.) and generic `Component<P>` — pure types                             |
| `flow.ts`         | `Show` / `For` control-flow components (optional; built on signals + markers)                                                           |
| `render.ts`       | `render(root, container)` — mounts a JSX tree, returns `dispose()` for cleanup                                                          |
| `react-portal.ts` | `ReactPortal(component, props)` — bridges React components into kiko trees                                                              |
| `index.ts`        | Barrel re-exports                                                                                                                       |

### Data Flow

```
TSX file (/** @jsxImportSource @kikojs/dom */)
  → jsx('div', { ... }) or Component(props)
    → document.createElement / Component()
      → real DOM nodes (no vdom)
        → Signal.subtle.Watcher per binding
          → fine-grained DOM updates on signal change
            → cleanupWatchers() unwatches via Signal.subtle.introspectSources
```

Component functions execute **exactly once** — no re-render cycle. Signals embedded in children or props create per-binding watchers that update specific text nodes, attributes, or swap whole subtrees (when a signal child resolves to a `Node`/array). Cleanup is recursive, `WeakMap<Node, Set<Watcher>>`-based; `cleanupWatchers` uses `Signal.subtle.introspectSources(w)` then `w.unwatch(...sources)` because `watcher.unwatch()` with no args is a no-op in `signal-polyfill` v0.2.

### Public API

```ts
// @kikojs/signal
createSignal<T>(initial: T): Signal.State<T>            // standard TC39 State
computed<T>(fn: () => T): Signal.Computed<T>
derived<T>(fn: () => T): Signal.Computed<T>             // alias of computed
effect(fn: () => void | (() => void)): () => void       // batched, error-isolated
onCleanup(fn: () => void): void                          // register cleanup for the active effect
batch<T>(fn: () => T): T                                 // coalesce signal writes into one flush
untrack<T>(fn: () => T): T                               // read without subscribing
on<T>(deps, fn, { defer? }): EffectFn                   // explicit-dep effect helper
createEmitter<Events>(): Emitter<Events>
createWatcher(callback: () => void): Watcher

// @kikojs/dom
jsx(tag: string | Component<any>, props: Props | null): Node
jsxs = jsx; jsxDEV = jsx
Fragment(props): DocumentFragment
render(root: Node, container: Element): () => void
Show<T>(props): DocumentFragment                         // conditional render
For<T>(props): DocumentFragment                          // list render
// JSX namespace: IntrinsicElements (HTML+SVG), Element, ElementChildrenAttribute, …

// React bridge (separate export; only needed when embedding React components)
ReactPortal(props: { component: React.ComponentType, ...rest }): HTMLElement
```

## Key Directories

```
kiko/
├── index.ts                          Root placeholder (Bun init default)
├── package.json                      Workspace root: husky, oxlint, oxfmt, lint-staged
├── tsconfig.json                     Shared TS base (ESNext, strict, bundler resolution)
├── .oxlintrc.json / .oxfmtrc.json    Lint + format config
├── .husky/pre-commit                 lint-staged hook
├── packages/
│   ├── @kikojs/signal/              Signal primitives
│   │   ├── src/
│   │   │   ├── index.ts            Barrel re-exports
│   │   │   ├── signal.ts           createSignal, isSignal
│   │   │   ├── computed.ts         computed, derived, toSignalValue, watchValue
│   │   │   ├── effect.ts           effect (batched, error-isolated, cleanup scope)
│   │   │   ├── scope.ts            onCleanup + scope helpers
│   │   │   ├── scheduler.ts        batch, untrack, scheduleEffect
│   │   │   ├── on.ts               on() dep helper
│   │   │   └── emit.ts             Emitter, createEmitter
│   │   ├── test/                    *.test.ts (bun:test)
│   │   └── package.json             exports ".", scripts: build, test
│   └── @kikojs/dom/                 DOM library
│       ├── src/
│       │   ├── index.ts             Barrel re-exports
│       │   ├── signal.ts            Thin signal-polyfill wrappers
│       │   ├── jsx-runtime.ts       JSX factory, signal binding, structural swap, cleanup
│       │   ├── jsx-types.ts         JSX namespace + generic Component<P> (types only)
│       │   ├── flow.ts              Show / For control flow
│       │   ├── render.ts            Mount entry point + dispose lifecycle
│       │   └── react-portal.ts      React ↔ kiko bridge
│       ├── test/                     *.test.ts(x) (bun:test, happy-dom)
│       └── package.json             exports ".", "./jsx-runtime", "./jsx-dev-runtime", "./react-portal"
├── examples/
│   ├── basic/                       Counter demo (Bun bundler + dev server)
│   ├── react-portal/                ReactPortal demo
│   └── tailwind/                    Tailwind + kiko demo
└── docs/compose/
    ├── specs/                        Design specs (agentic)
    └── plans/                        Implementation plans (agentic)
```

## Development Commands

```bash
# Install dependencies
bun install

# Run tests (both packages have a `test` script; root `bun test` runs everything)
bun test
bun test packages/@kikojs/dom/test/

# Build libraries
cd packages/@kikojs/signal && bun run build
cd packages/@kikojs/dom && bun run build

# Lint + format (root scripts)
bun run lint          # oxlint .
bun run fmt           # oxfmt --write .
bun run fmt:check     # oxfmt --check .

# Type-check — per project (root tsc has no DOM lib and scans examples needing react types,
# so type-check each package/example with its own tsconfig):
bunx tsc --noEmit -p packages/@kikojs/signal/tsconfig.json
bunx tsc --noEmit -p packages/@kikojs/dom/tsconfig.json
bunx tsc --noEmit -p examples/basic/tsconfig.json
```

## Code Conventions & Common Patterns

### TypeScript

- **Strict mode** enabled globally; `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- **verbatimModuleSyntax: true** — use `import type` for type-only imports
- **Module resolution**: `bundler` (Bun-native)
- **Target/lib**: ESNext (root); DOM added per-package (`@kikojs/dom`, examples)
- **JSX**: `react-jsx` with `jsxImportSource: "@kikojs/dom"` (set in `@kikojs/dom/tsconfig.json` and example tsconfigs)

### JSX

- Use `/** @jsxImportSource @kikojs/dom */` pragma at top of `.tsx` files (or set `jsxImportSource` in the project tsconfig)
- JSX compiles to real DOM — no virtual DOM diffing
- Intrinsic elements are typed via `JSX.IntrinsicElements` in `jsx-types.ts` (HTML + SVG maps, plus a permissive index signature for custom tags)

### Signals

- Create with `createSignal<T>(initial)` (returns `Signal.State<T>`); detect with `isSignal(val)`
- Signals in props/children auto-create `Signal.subtle.Watcher` instances
- A signal child whose value is a `Node`/array triggers a marker-anchored subtree swap (structural reactivity)
- `effect` re-runs are microtask-batched and deduplicated; wrap multiple writes in `batch(fn)` to coalesce
- `onCleanup(fn)` registers a cleanup for the currently running effect; cleanups run in reverse order before re-runs and on dispose
- `on(deps, fn)` runs `fn` only when `deps` change, untracked otherwise
- Cleanup via `cleanupWatchers(node)` — recursive, WeakMap-based; uses `Signal.subtle.introspectSources` to actually unwatch

### Control flow

- `Show({ when, fallback?, children })` — renders `children` (or `fallback`) based on a signal/value; `children` may be a function receiving the truthy value
- `For({ each, children })` — renders a list, re-rendering on `each` change; `children` receives `(item, index)` where `index` is an accessor. Non-keyed reconciliation.

### Naming

- `camelCase` for variables, functions, parameters
- `PascalCase` for components and type names
- File names: `kebab-case.ts` (e.g., `jsx-runtime.ts`, `react-portal.ts`)

### Async

- `ReactPortal` uses dynamic `import('react')` for lazy loading
- Tests use `async` `beforeAll` for setup

### Error Handling

- `effect` and the scheduler isolate errors: a throwing effect reports via the host `reportError` hook and does not stop sibling effects or future re-runs
- `cleanupWatchers` swallows cleanup-callback errors so one failure does not abort sibling cleanup

## Important Files

| File                                       | Role                                                                |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `packages/@kikojs/signal/src/index.ts`     | Barrel — signal API, scheduler, scope, on, emitter, watcher factory |
| `packages/@kikojs/signal/src/signal.ts`    | `createSignal` (returns `Signal.State`), `isSignal`                 |
| `packages/@kikojs/signal/src/computed.ts`  | `computed` / `derived` / `toSignalValue` / `watchValue`             |
| `packages/@kikojs/signal/src/effect.ts`    | `effect` (batched, error-isolated, cleanup scope)                   |
| `packages/@kikojs/signal/src/scope.ts`     | `onCleanup` + scope helpers                                         |
| `packages/@kikojs/signal/src/scheduler.ts` | `batch`, `untrack`, `scheduleEffect`                                |
| `packages/@kikojs/signal/src/on.ts`        | `on` dep helper                                                     |
| `packages/@kikojs/signal/src/emit.ts`      | `Emitter`, `createEmitter`                                          |
| `packages/@kikojs/dom/src/jsx-runtime.ts`  | JSX factory, signal binding, structural swap, cleanup               |
| `packages/@kikojs/dom/src/jsx-types.ts`    | `JSX` namespace + generic `Component<P>` (types only)               |
| `packages/@kikojs/dom/src/flow.ts`         | `Show` / `For` control flow                                         |
| `packages/@kikojs/dom/src/signal.ts`       | Thin signal-polyfill wrappers (self-contained)                      |
| `packages/@kikojs/dom/src/render.ts`       | Mount entry point + dispose lifecycle                               |
| `packages/@kikojs/dom/src/react-portal.ts` | React ↔ kiko bridge                                                 |
| `packages/@kikojs/dom/package.json`        | Library exports, build config, deps                                 |
| `tsconfig.json`                            | Shared TypeScript base config                                       |
| `packages/@kikojs/dom/test/setup.ts`       | Test environment (happy-dom globals)                                |

## Runtime/Tooling Preferences

- **Runtime**: Bun (required — uses `bun:test`, `Bun.file`, Bun workspace features)
- **Package manager**: Bun (`bun.lock`)
- **Git hooks**: `husky` pre-commit runs `lint-staged` then `oxlint .` (staged TS/JS get oxfmt --write + oxlint; JSON/MD/CSS/HTML get oxfmt)
- **Linting/formatting**: `oxlint` + `oxfmt` (configured via `.oxlintrc.json`, `.oxfmtrc.json`, run via root `lint`/`fmt` scripts)
- **No CI/CD config**

## Testing & QA

- **Framework**: Bun built-in test runner (`bun:test`)
- **DOM environment**: `happy-dom` (v17) — injected via `test/setup.ts` which assigns `window`, `document`, `Node`, `HTMLElement`, `DocumentFragment` to `globalThis`
- **Test pattern**: `describe`/`it` blocks with `expect` assertions (Jest-compatible API)
- **~95 tests** across 13 files covering: signal primitives, computed/derived, effect + error isolation + cleanup scope, scheduler (batch/untrack), `on`, emitter, JSX factory, render lifecycle, structural-reactive children, `Show`/`For`, JSX types, React portal
- **No coverage tooling** (`.gitignore` lists `coverage/` and `*.lcov` but no config exists)
- **No mocking** — hand-rolled stubs only (e.g., `const MockComp = () => null`)
- **No fixtures** — test data created inline per test case

### Running Tests

```bash
# All tests
bun test

# Specific test file
bun test packages/@kikojs/dom/test/flow.test.tsx

# Watch mode
bun test --watch
```

### Test File Conventions

- Files: `*.test.ts` (non-JSX), `*.test.tsx` (JSX tests)
- JSX test files require `/** @jsxImportSource @kikojs/dom */` pragma
- DOM-dependent tests use `beforeAll(async () => { await import('./setup') })` to inject globals
- `jsx-types.test.tsx` doubles as a compile-time guard: `// @ts-expect-error` lines prove the JSX types reject real misuses
