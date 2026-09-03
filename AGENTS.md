# Repository Guidelines

## Project Overview

**kiko** is a reactive DOM library built on [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill) (the TC39 Signals proposal polyfill) for fine-grained reactivity. It provides a custom JSX runtime that compiles to real DOM nodes (no virtual DOM, no reconciliation). Control-flow components (`Show`, `For`, `Suspend`, `ErrorBoundary`), SSR + hydration, and a React portal bridge sit on top of the same standard signal primitives.

The monorepo contains three packages plus a benchmark, all built on `signal-polyfill` directly:

- `@kikojs/signal` — signal primitives, computed/derived signals, effects with cleanup scope + error isolation, a batched scheduler, `untrack`, an `on` dep helper, `createStore` (proxy-based fine-grained state), `createResource` (async data), and a typed event emitter
- `@kikojs/dom` — DOM library: JSX factory, render/mount, client hydration, SSR (`@kikojs/dom/server`), structural-reactive children, `Show`/`For`/`Suspend`/`ErrorBoundary` control flow, scoped `Style`, `lazy` code-splitting, a portal helper, a React portal bridge, and the JSX type surface
- `@kikojs/router` — declarative router on top of `@kikojs/dom`: path/hash modes, nested routes, guards, `Link`/`Outlet` primitives, route hooks
- `packages/benchmark` (`@kikojs/benchmark`) — `store` vs `immer` benchmark

`@kikojs/dom` does **not** depend on `@kikojs/signal`; it re-implements the thin signal wrappers it needs over `signal-polyfill` so the DOM package stays self-contained. `@kikojs/router` depends on both `@kikojs/dom` and `@kikojs/signal`. `@kikojs/signal` is the richer signal toolkit for application code.

### Signal-standard compatibility

`createSignal<T>(initial)` returns a plain `Signal.State<T>`; `computed`/`derived` return `Signal.Computed<T>`. No brand symbols, no custom accessor objects — everything is the standard TC39 Signals interface, so any library that consumes `Signal.State`/`Signal.Computed` works unchanged. The extra helpers (`batch`, `untrack`, `on`, `onCleanup`, `createStore`, `Show`, `For`, …) are purely additive and never alter how signals behave.

## Architecture & Data Flow

### Core Modules

**`packages/signal/src/`**

| Module         | Purpose                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal.ts`    | `createSignal<T>()` returns `Signal.State<T>`; `isSignal()` type-guards `State`/`Computed`                                                                                                                      |
| `computed.ts`  | `computed<T>(fn)` / `derived<T>(fn)` return `Signal.Computed<T>`; `toSignalValue`, `watchValue`                                                                                                                 |
| `effect.ts`    | `effect(fn)` — re-runs on dependency change; batched, error-isolated, integrates cleanup scope                                                                                                                  |
| `scope.ts`     | `onCleanup(fn)` + internal `runInScope`/`flushScope` for per-effect cleanups                                                                                                                                    |
| `scheduler.ts` | `batch(fn)` (deferred flush), `untrack(fn)`, shared `scheduleEffect` dedup, `MAX_FLUSH_DEPTH` guard                                                                                                             |
| `on.ts`        | `on(deps, fn, { defer? })` — explicit-dependency effect helper (SolidJS-style)                                                                                                                                  |
| `store.ts`     | `createStore` — limu-inspired proxy store: every property is a `StoreSignal<T> extends Signal.State<T>`; eager wrapping at create/set time; `ref` / `isRef` / `REF`; versioned wrappers; circular-ref detection |
| `resource.ts`  | `createResource` — async data loading with watch/cancel semantics                                                                                                                                               |
| `emit.ts`      | `createEmitter<Events>()` / `Emitter` — typed event pipeline                                                                                                                                                    |
| `index.ts`     | Barrel exports, plus `createWatcher()` wrapper around `Signal.subtle.Watcher`                                                                                                                                   |

**`packages/dom/src/`**

| Module                 | Purpose                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal.ts`            | Thin wrappers over `signal-polyfill` (`createSignal`, `isSignal`, `createWatcher`) — re-implemented, not imported from `@kikojs/signal`                                |
| `jsx-runtime.ts`       | JSX factory: `jsx()`, `jsxs()`, `jsxDEV()`, `Fragment`, `Style`; signal child/prop binding; marker-based structural swap; `cleanupWatchers`                            |
| `jsx-types.ts`         | `JSX` namespace (`IntrinsicElements` for HTML+SVG, `Element`, etc.) and generic `Component<P>` — pure types                                                            |
| `flow.ts`              | `Show` / `For` / `Suspend` / `ErrorBoundary` control-flow components (optional; built on signals + markers)                                                            |
| `render.ts`            | `render(root, container)` — mounts a JSX tree, returns `dispose()` for cleanup                                                                                         |
| `hydrate.ts`           | `hydrate(root, container)` / `hydrateWithState(root, container, state?)` — client-side hydration; `hydrateWithState` restores serialized signal state before hydration |
| `ssr.ts` / `server.ts` | `renderToFragment` (string) / `renderToStream` (ReadableStream) — server-side rendering; `server.ts` registers the runtime bridge and exports signal serialize APIs    |
| `ssr-stream.ts`        | `renderToStream()` — streaming SSR: builds a chunk tree (sync/async), flushes sync skeleton immediately, defers async Suspend content until resolve                    |
| `signal-serialize.ts`  | `startSignalCapture` / `serializeSignals` / `restoreSignals` / `hydrateWithState` — capture signal values during SSR, restore on client before hydration               |
| `ssr-mode.ts`          | ~30-byte runtime bridge (`SSRRuntime` interface, `set/getSSRRuntime`) so client jsx/flow never import SSR code                                                         |
| `portal.ts`            | `createPortal(node, target)` — render a subtree into another DOM node                                                                                                  |
| `context.ts`           | `createContext` / `useContext` — dependency injection; the context object is the provider (React 19 style), children must be a thunk (deferred eval)                   |
| `react-portal.ts`      | `ReactPortal(component, props)` — bridges React components into kiko trees (separate export)                                                                           |
| `index.ts`             | Barrel re-exports                                                                                                                                                      |

**`packages/router/src/`**

| Module                    | Purpose                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router.ts`               | `createRouter(options)` (path/hash modes), `getRouteProps` — core routing state machine + matcher integration                                                                                                   |
| `components.tsx`          | `Router`, `Link`, `Outlet`, `Navigate` declarative components                                                                                                                                                   |
| `hooks.ts`                | `useRouter`, `useRoute`, `useParams`, `useQuery`, `useLocation`, `useNavigate`, `tryUseRouter`, `setActiveRouter`                                                                                               |
| `guards.ts`               | `createAuthGuard`, `combineGuards`, `createAsyncGuard` — route guards                                                                                                                                           |
| `history.ts`              | `createPathHistory` / `createHashHistory` / `createMemoryHistory` → reactive `HistoryAdapter` (`location` signal, `push`, `replace`, `go`, `back`, `forward`, `dispose`); injectable & shareable across routers |
| `matcher.ts`              | Path matcher tree (precompiled) + `Matcher` type                                                                                                                                                                |
| `utils.ts`                | `redirect`, `redirectReplace`, `buildPath`, `getQueryValue`, `pathsEqual`                                                                                                                                       |
| `context.ts` / `types.ts` | Router context object + shared types (`RouteParams`, `RouteLocation`, `RouteGuard`, `RouterOptions`, …)                                                                                                         |
| `index.ts`                | Barrel re-exports                                                                                                                                                                                               |

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

SSR path: server entry renders to string with `<!---->` markers for signal children and `<!--show-->`/`<!--for-->`/`<!--suspend-->` comments; the client `hydrate` re-creates the tree via `PendingNode` lazy alignment (adoption order == document order).

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
createStore<T>(initial: T): StoreRecord<T>              // proxy store: store.user.age.set(31)
ref<T>(value: T): Ref<T>                                 // store ref marker; isRef / REF
createResource<T>(loader, options?): Resource<T>        // async data loading
createEmitter<Events>(): Emitter<Events>
createWatcher(callback: () => void): Watcher

// @kikojs/dom
jsx(tag: string | Component<any>, props: Props | null): Node
jsxs = jsx; jsxDEV = jsx
Fragment(props): DocumentFragment
render(root: Node, container: Element): () => void       // client mount + dispose
hydrate(root: Node, container: Element): () => void      // hydrate SSR output
createPortal(node: Node, target: Element): Node
createContext<T>(defaultValue?): Context<T>             // context object IS the provider
useContext<T>(ctx: Context<T>): T | undefined           // nearest provider value or default
Style(props): Node                                       // scoped css (default) / <style global> global; supports `nonce` for CSP; warns at fragment root (no ancestor to scope)
Show<T>(props): DocumentFragment                         // conditional render
For<T>(props): DocumentFragment                          // list render (keyed via getKey, else non-keyed)
Suspend(props): DocumentFragment                         // async/lazy placeholder + fallback
ErrorBoundary(props): DocumentFragment                   // error isolation with fallback
lazy<T>(loader: () => Promise<{ default: Component<T> }>): Component<T>
// JSX namespace: IntrinsicElements (HTML+SVG), Element, ElementChildrenAttribute, …

// @kikojs/dom/server (separate export)
renderToFragment(root: Node): string                     // SSR fragment with markers
renderToStream(root: Node): ReadableStream<string>       // streaming SSR: sync skeleton flushes immediately, async content deferred
startSignalCapture(): void                               // begin capturing signal values (by createSignal order)
stopSignalCapture(): void                                // end capturing
serializeSignals(): string                               // serialize captured signal values to JSON array
restoreSignals(json: string | unknown[]): void           // prepare to restore signals on client (consume by createSignal order)
stopSignalRestore(): void                                // end restore mode

// @kikojs/dom (client)
hydrateWithState(root: () => unknown, container: Element, state?: string | unknown[]): () => void  // hydrate with signal state restoration

// React bridge (separate export; only needed when embedding React components)
ReactPortal(props: { component: React.ComponentType, ...rest }): HTMLElement

// @kikojs/router
createRouter(options: { mode: "path" | "hash", ... }): RouterInstance
getRouteProps(options): { path, ... }
Router / Link / Outlet / Navigate                         // components (routing is config-driven via `routes`)
useRouter / useRoute / useParams / useQuery / useLocation / useNavigate
redirect(to, options?) / redirectReplace(to, options?) / buildPath(path, params?, query?)
createAuthGuard / combineGuards / createAsyncGuard
createPathHistory(base?, env?) / createHashHistory(env?)
```

htm note: the built-in `dom`/`htm` tagged-template runtime was **removed** (commit `1fb7252`); use the external `htm` package with the ~10-line glue pattern shown in `examples/htm/` (runtime template → same `jsx` factory, no build step).

## Key Directories

```
kiko/
├── index.ts                          Root placeholder (Bun init default)
├── package.json                      Workspace root: husky, oxlint, oxfmt, lint-staged
├── tsconfig.json                     Shared TS base (ESNext, strict, bundler resolution)
├── .oxlintrc.json / .oxfmtrc.json    Lint + format config
├── .husky/pre-commit                 lint-staged hook
├── .github/workflows/                ci.yml, deploy-pages.yml (docs site), publish.yml (npm)
├── packages/
│   ├── signal/                       @kikojs/signal — signal primitives
│   │   ├── src/
│   │   │   ├── index.ts            Barrel re-exports
│   │   │   ├── signal.ts           createSignal, isSignal
│   │   │   ├── computed.ts         computed, derived, toSignalValue, watchValue
│   │   │   ├── effect.ts           effect (batched, error-isolated, cleanup scope)
│   │   │   ├── scope.ts            onCleanup + scope helpers
│   │   │   ├── scheduler.ts        batch, untrack, scheduleEffect
│   │   │   ├── on.ts               on() dep helper
│   │   │   ├── store.ts            createStore, ref/isRef/REF
│   │   │   ├── resource.ts         createResource
│   │   │   └── emit.ts             Emitter, createEmitter
│   │   ├── test/                    *.test.ts (bun:test)
│   │   └── package.json             exports ".", scripts: build, test
│   ├── dom/                         @kikojs/dom — DOM library
│   │   ├── src/
│   │   │   ├── index.ts             Barrel re-exports
│   │   │   ├── signal.ts            Thin signal-polyfill wrappers
│   │   │   ├── jsx-runtime.ts       JSX factory, signal binding, structural swap, cleanup
│   │   │   ├── jsx-types.ts         JSX namespace + generic Component<P> (types only)
│   │   │   ├── flow.ts              Show / For / Suspend / ErrorBoundary
│   │   │   ├── render.ts            Mount entry point + dispose lifecycle
│   │   │   ├── hydrate.ts           Client hydration (PendingNode lazy alignment)
│   │   │   ├── ssr.ts / server.ts   SSR string renderer + server entry (bridge registration)
│   │   │   ├── ssr-mode.ts          ~30-byte SSR runtime bridge (client-safe)
│   │   │   ├── lazy.ts              lazy code-splitting
│   │   │   ├── style.ts             Scoped-css engine for <Style>
│   │   │   ├── portal.ts            createPortal
│   │   │   ├── context.ts           createContext / useContext (provider = context object)
│   │   │   ├── shared.ts            Shared value helpers
│   │   │   └── react-portal.ts      React ↔ kiko bridge
│   │   ├── test/                     *.test.ts(x) (bun:test, happy-dom)
│   │   └── package.json             exports ".", "./server", "./jsx-runtime", "./jsx-dev-runtime", "./react-portal"
│   ├── router/                      @kikojs/router — declarative router
│   │   ├── src/                     router.ts, components.tsx, hooks.ts, guards.ts,
│   │   │                            history.ts, matcher.ts, utils.ts, context.ts, types.ts
│   │   ├── test/                     *.test.ts(x)
│   │   └── package.json             exports "."
│   └── benchmark/                   @kikojs/benchmark
│       ├── store-vs-immer.bench.ts  createStore vs immer benchmark (bun:bench)
│       └── package.json             deps: @kikojs/signal, immer (scoped here)
├── examples/
│   ├── basic/                       Counter demo (Bun bundler + dev server)
│   ├── htm/                         htm tagged-template demo (external htm + glue code)
│   ├── react-portal/                ReactPortal demo
│   ├── ssr/                         Full-stack SSR + hydration demo (Bun.serve + bundler)
│   └── tailwind/                    Tailwind + kiko demo
└── docs/                            Static HTML site (built by bun run docs/build.ts)
```

## Development Commands

```bash
# Install dependencies
bun install

# Run tests (root pretest builds all packages first)
bun test
bun test packages/dom/test/

# Build libraries (signal → dom → router; root `build` chains them)
bun run build
cd packages/signal && bun run build

# Lint + format (root scripts)
bun run lint          # oxlint .
bun run fmt           # oxfmt --write .
bun run fmt:check     # oxfmt --check .

# Type-check — root script covers all packages + all examples (no DOM lib at root, so use per-project tsconfigs)
bun run typecheck

# Docs site build (static HTML; must stay valid — malformed HTML blocks oxfmt pre-commit)
bun run site:build

# Benchmark
cd packages/benchmark && bun run bench
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

### Store

- `createStore(initial)` wraps every property into a `StoreSignal` (eager wrapping at create/set time): fast writes, slow creates (limu-inspired tradeoff)
- Access pattern is all-level signals: `store.user.age.set(31)`; plain-object assignment auto-wraps nested values
- `ref(value)` opts a value out of wrapping; `isRef` / `REF` identify refs

### Control flow

- `Show({ when, fallback?, children })` — renders `children` (or `fallback`) based on a signal/value; `children` may be a function receiving the truthy value
- `For({ each, children, getKey? })` — renders a list, re-rendering on `each` change; `children` receives `(item, index)` where `index` is an accessor. Without `getKey` it reconciles non-keyed; with `getKey` surviving keys keep their DOM nodes and `children` receives an item accessor `() => T`.
- `Suspend` / `ErrorBoundary` — async/error isolation with fallback rendering; `lazy(loader)` code-splits a component
- Router: config-driven `routes` array, nested via `Outlet`, navigation via `Link`/`Navigate`/`useNavigate`; guards intercept before render

### Context

- `createContext(defaultValue?)` returns a `Context<T>` whose object IS the provider component (React 19 style): `<Theme value="dark">{() => <Child/>}</Theme>`
- **Children MUST be a thunk** — JSX children evaluate eagerly before the provider runs, so eager children can never see the value; eager children throw `TypeError`
- `useContext(ctx)` returns the nearest provider value (walking the frame stack top-down) or the default; `value` may be a signal, which consumers can bind into props for reactive updates without a re-render cycle
- Same deferred-evaluation protocol as `Show`/`For`/`ErrorBoundary`; works in SSR and hydration (module-level frame stack, balanced synchronously)

### Naming

- `camelCase` for variables, functions, parameters
- `PascalCase` for components and type names
- File names: `kebab-case.ts` (e.g., `jsx-runtime.ts`, `react-portal.ts`)

### Async

- `createResource` handles async data; `lazy` + `Suspend` handle async components
- `ReactPortal` uses dynamic `import('react')` for lazy loading
- Tests use `async` `beforeAll` for setup

### Error Handling

- `effect` and the scheduler isolate errors: a throwing effect reports via the host `reportError` hook and does not stop sibling effects or future re-runs
- `ErrorBoundary` isolates render errors with a fallback
- `cleanupWatchers` swallows cleanup-callback errors so one failure does not abort sibling cleanup

## Important Files

| File                                    | Role                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `packages/signal/src/index.ts`          | Barrel — signal API, scheduler, scope, on, emitter, watcher factory |
| `packages/signal/src/signal.ts`         | `createSignal` (returns `Signal.State`), `isSignal`                 |
| `packages/signal/src/computed.ts`       | `computed` / `derived` / `toSignalValue` / `watchValue`             |
| `packages/signal/src/effect.ts`         | `effect` (batched, error-isolated, cleanup scope)                   |
| `packages/signal/src/store.ts`          | `createStore` + `ref`/`isRef`/`REF` (limu-inspired proxy store)     |
| `packages/signal/src/resource.ts`       | `createResource` async data loading                                 |
| `packages/dom/src/jsx-runtime.ts`       | JSX factory, signal binding, structural swap, cleanup               |
| `packages/dom/src/jsx-types.ts`         | `JSX` namespace + generic `Component<P>` (types only)               |
| `packages/dom/src/flow.ts`              | `Show` / `For` / `Suspend` / `ErrorBoundary` control flow           |
| `packages/dom/src/render.ts`            | Mount entry point + dispose lifecycle                               |
| `packages/dom/src/hydrate.ts`           | Client hydration (PendingNode lazy alignment)                       |
| `packages/dom/src/ssr.ts` / `server.ts` | SSR renderer + `@kikojs/dom/server` entry                           |
| `packages/dom/src/style.ts`             | Scoped-css engine for `<Style>`                                     |
| `packages/dom/src/react-portal.ts`      | React ↔ kiko bridge                                                 |
| `packages/router/src/index.ts`          | Router barrel — createRouter, components, hooks, guards, history    |
| `packages/dom/package.json`             | Library exports, build config, deps                                 |
| `tsconfig.json`                         | Shared TypeScript base config                                       |
| `packages/dom/test/setup.ts`            | Test environment (happy-dom globals)                                |

## Constraints

- **NEVER hand-edit `bun.lock`** — 永远避免直接修改 lock 文件。所有依赖变更必须通过 `bun install` / `bun add` / `bun remove` / `bun update` 等包管理器命令生成，手工编辑易导致解析不一致、workspace 版本漂移或意外的 integrity 错误。此约束永久有效。

## Runtime/Tooling Preferences

- **Runtime**: Bun (required — uses `bun:test`, `Bun.file`, Bun workspace features)
- **Package manager**: Bun (`bun.lock` — see Constraints above; never edit by hand)
- **Git hooks**: `husky` pre-commit runs `lint-staged` then `oxlint .` (staged TS/JS get oxfmt --write + oxlint; JSON/MD/CSS/HTML get oxfmt)
- **Linting/formatting**: `oxlint` + `oxfmt` (configured via `.oxlintrc.json`, `.oxfmtrc.json`, run via root `lint`/`fmt` scripts)
- **CI/CD**: `.github/workflows/ci.yml` (lint/typecheck/test), `deploy-pages.yml` (docs site → GitHub Pages), `publish.yml` (npm publish). Packages publish as 0.0.1 via `bun run build` + `bun test` in prepublishOnly.

## Testing & QA

- **Framework**: Bun built-in test runner (`bun:test`)
- **DOM environment**: `happy-dom` (v17) — injected via `test/setup.ts` which assigns `window`, `document`, `Node`, `HTMLElement`, `DocumentFragment` to `globalThis`
- **Test pattern**: `describe`/`it` blocks with `expect` assertions (Jest-compatible API)
- **~474 tests across 36 files (~1106 expect calls)** covering: signal primitives, computed/derived, effect + error isolation + cleanup scope, scheduler (batch/untrack), `on`, store (incl. circular-ref detection), resource, emitter, JSX factory, render lifecycle, structural-reactive children, `Show`/`For`/`Suspend`/`ErrorBoundary`, `Style` (incl. nonce), `lazy`, portal, context, hydrate (incl. signal state restore), SSR (fragment + streaming), signal serialize, router (components/guards/history/utils), JSX types, React portal
- **No coverage tooling** (`.gitignore` lists `coverage/` and `*.lcov` but no config exists)
- **No mocking** — hand-rolled stubs only (e.g., `const MockComp = () => null`)
- **No fixtures** — test data created inline per test case

### Running Tests

```bash
# All tests (root pretest builds packages first)
bun test

# Specific test file
bun test packages/dom/test/flow.test.tsx

# Watch mode
bun test --watch

# Single package
cd packages/router && bun test
```

### Test File Conventions

- Files: `*.test.ts` (non-JSX), `*.test.tsx` (JSX tests)
- JSX test files require `/** @jsxImportSource @kikojs/dom */` pragma
- DOM-dependent tests use `beforeAll(async () => { await import('./setup') })` to inject globals
- `jsx-types.test.tsx` doubles as a compile-time guard: `// @ts-expect-error` lines prove the JSX types reject real misuses
