# kiko

A fine-grained reactive DOM library built on [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill) (the polyfill for the TC39 Signals proposal). JSX compiles directly to real DOM nodes, component functions run exactly once, and a signal change updates only the node that read it.

> **Project status**: kiko is in **early development** (`v0.0.1`). The public API is not yet stable and breaking changes may land at any time. Pin your dependency to an exact version and review upgrades carefully.

> 中文版本：[README.md](./README.md)

## Features

- **No virtual DOM, no diff** — JSX compiles to real nodes; reactivity comes from signal bindings.
- **Fine-grained reactivity** — a signal in props/children creates a watcher at its read site and updates only that node; when a signal value resolves to a node/array, the whole subtree is swapped.
- **Standard signal interface** — every signal is a standard TC39 `Signal.State` / `Signal.Computed`, so any library consuming those interfaces works unchanged.
- **SSR + hydration** — `@kikojs/dom/server` renders to strings; the client `hydrate` aligns against existing DOM.
- **Scoped CSS** — the `<style>` inline element is a scoped-style component, giving Vue-style scoped css without a template compiler.
- **Control-flow components** — `Show` / `For` / `ErrorBoundary` / `Suspend` / `lazy`.
- **React bridge** — `ReactPortal` embeds React components into kiko trees.
- **HMR** — React Fast Refresh semantics: components hot-swap in place while component-internal and module-level signal state is preserved (`@kikojs/bun` plugin).

## Packages

| Package          | Entry                                                          | Purpose                                                                                                                  |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@kikojs/signal` | `@kikojs/signal`                                               | `createSignal` / `computed` / `effect` / `batch` / `untrack` / `on` / `createStore` / `createResource` / `createEmitter` |
| `@kikojs/dom`    | `@kikojs/dom`, `@kikojs/dom/jsx-runtime`, `@kikojs/dom/server` | JSX factory, `render` / `hydrate`, control-flow components, `lazy`, `Style`, `createPortal`, SSR entry                   |
| `@kikojs/router` | `@kikojs/router`                                               | `createRouter`, `Router` / `Link` / `Outlet` / `Navigate`, hooks, guards                                                 |
| `@kikojs/bun`    | `@kikojs/bun`                                                  | HMR plugin for Bun's dev server (`bunfig.toml` `[serve.static]`), paired with the `@kikojs/dom/hmr` runtime              |

`@kikojs/dom` does **not** depend on `@kikojs/signal` — it carries its own thin signal-polyfill wrapper to stay self-contained.

## Quick Start

```bash
bun add @kikojs/signal @kikojs/dom
```

Add the `jsxImportSource` pragma at the top of your TSX file (or set it in your project tsconfig):

```tsx
/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/signal"
import { render } from "@kikojs/dom"

function App() {
  const count = createSignal(0)
  return <button onClick={() => count.set(count.get() + 1)}>{count}</button>
}

const dispose = render(<App />, document.getElementById("app")!)
```

`{count}` drops a `Signal.State` straight into the children — kiko creates a watcher for that binding, so clicking updates only that text node.

### Hot Module Replacement

With Bun's full-stack dev server (`Bun.serve` + `development: { hmr: true }`), enable the plugin in `bunfig.toml`:

```toml
[serve.static]
plugins = ["@kikojs/bun"]
```

The plugin rewrites top-level components into registry-backed wrappers and injects `import.meta.hot` glue (eliminated in production builds). Editing a component file re-runs it with the new implementation and swaps the DOM in place; component-internal signals restore their previous values by creation order and module-level signals reuse the previous signal objects — state survives. See `examples/hmr` (`bun run dev`) for a full demo.

## Examples

| Example                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `examples/basic`        | Counter, Bun bundler + dev server                     |
| `examples/htm`          | `dom` / `htm` tagged-template runtime (buildless JSX) |
| `examples/react-portal` | ReactPortal bridge for React components               |
| `examples/ssr`          | Full-stack Bun SSR + client hydration                 |
| `examples/hmr`          | HMR demo (state preservation), `bun run dev`          |

## Documentation

Visit the project site: **https://kiko-js.github.io/kiko/**

The site source lives in `docs/` (static HTML, with `signal.html` / `dom.html` / `router.html` / `examples.html` / `api.html`), built and deployed to GitHub Pages via GitHub Actions.

## Development

```bash
bun install          # install deps (workspaces: packages/*, examples/*, docs)
bun run build        # build the three packages into dist/ (JS + .d.ts)
bun run test         # run all tests (auto-builds first)
bun run lint         # oxlint
bun run fmt          # format with oxfmt
bun run site:build   # build the docs site (auto-builds first)
```

> Package entry points point at the `dist/` build output when published, so tests, examples and the docs site need a build first. Only `bun run site:build` builds automatically (via its `presite:build` hook); for `bun run test`, run `bun run build` first.

## License

MIT
