# @kikojs/dom

## 0.4.1

### Patch Changes

- ### @kikojs/dom (patch)
  - use plain semver ranges for published runtime workspace deps (a9c6fa2)

  ### @kikojs/router (patch)
  - use plain semver ranges for published runtime workspace deps (a9c6fa2)

- Updated dependencies [1638d47]
  - @kikojs/hmr@0.1.0

## 0.4.0

### Minor Changes

- ### @kikojs/dom (minor)
  - point build configs at built declarations for cross-package imports (816bbcd)
  - **dom**: bare NoSSR children, inspectable lazy placeholders, conditional-rendering docs (ea52fea)

  ### @kikojs/router (minor)
  - point build configs at built declarations for cross-package imports (816bbcd)
  - **router**: document memory mode as first-class RouteMode (a019828)
  - **router**: memory history mode as first-class RouteMode (f9e6e68)

### Patch Changes

- @kikojs/hmr@0.0.1

## 0.3.0

### Minor Changes

- ### @kikojs/dom (minor)
  - hoist common devDependencies to workspace root (e046397)
  - **dom**: single-source SSR control flow; tighten signal-state API (8952f00)
  - **dom**: gate signal-state lossless scan on NODE_ENV, drop setSignalStateDebug (9f3de1e)
  - **dom**: signal-state JSON contract + debug-gated lossless gate + DI codec (47ca550)
  - **dom**: version the signal-state payload and harden its edges (55683fe)
  - **dom**: harden SSR streaming and attribute serialization (aeaf51a)
  - **dom**: skip redundant branch swaps; DX: hydrate strict mode + diagnostic context (cb497d7)
  - **dom**: request-scoped SSR isolation via withSSRScope (64812b7)
  - **dom**: close two leak paths found in post-refactor audit (a0f5f53)
  - **dom**: detect signal restore mismatch, warn on streamed scoped Style (35c0a76)
  - **dom**: retain and clean cached branches in hydrated Show/Suspend/ErrorBoundary (2fe148e)

  ### @kikojs/router (minor)
  - hoist common devDependencies to workspace root (e046397)
  - remove deprecated derived() alias and getActiveRouter() alias (72ee3e8)

  ### @kikojs/signal (minor)
  - hoist common devDependencies to workspace root (e046397)
  - remove deprecated derived() alias and getActiveRouter() alias (72ee3e8)

## 0.2.0

### Minor Changes

- ### @kikojs/dom (minor)
  - **dom**: share For reconcile engine, Suspend settle, and marker spellings (be450b8)
  - refresh stale comments after lazy materialization (c3af34e)
  - **dom**: lazy component materialization as default, For defaults to identity keying (8633aae)
  - **router**: support hydration, add router.ready, fix unmount cleanup (0db678a)
  - **dom**: remove createContext/useContext (c27fae8)

  ### @kikojs/router (minor)
  - refresh stale comments after lazy materialization (c3af34e)
  - **dom**: lazy component materialization as default, For defaults to identity keying (8633aae)
  - **router**: scope implicit router injection with render frames (79eab02)
  - **router**: support hydration, add router.ready, fix unmount cleanup (0db678a)
  - **router**: isolate SSR router resolution per request with withSSRRouter (e2e3ff3)

## 0.1.1

### Patch Changes

- ### @kikojs/dom (patch)
  - remove dead code and speculative API, fix docs drift (dcc7cf6)

  ### @kikojs/router (patch)
  - remove dead code and speculative API, fix docs drift (dcc7cf6)

  ### @kikojs/signal (patch)
  - remove dead code and speculative API, fix docs drift (dcc7cf6)

## 0.1.0

### Minor Changes

- ### @kikojs/router (minor)
  - pin bun version and isolate test files (8379be4)
  - upgrade happy-dom to v20.14.0 (b3bc8b1)
  - SSR raw-text serialization, hydration mismatch detection, router SSR safety (fb1b2d4)

  ### @kikojs/dom (minor)
  - upgrade happy-dom to v20.14.0 (b3bc8b1)
  - **dom**: export hydrateWithState from @kikojs/dom (8c7cf5b)
  - **dom**: export renderToFragment from @kikojs/dom/server (59c0cc2)
  - **dom**: warn when <Style> is at fragment root (no ancestor to scope) (64393ac)
  - **dom**: <style nonce> support in SSR and streaming SSR (ec7a94d)
  - **dom**: signal serialization for SSR→hydration state transfer (720e1f4)
  - **dom**: streaming SSR via renderToStream for lower TTFB (07b69e8)
  - SSR raw-text serialization, hydration mismatch detection, router SSR safety (fb1b2d4)

- 78f7e8e: Add streaming SSR (`renderToStream`), signal serialization for SSR→hydration state transfer, `<style nonce>` support, and fragment root scope warning
