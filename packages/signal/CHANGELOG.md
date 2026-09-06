# @kikojs/signal

## 0.1.0

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

## 0.0.7

### Patch Changes

- ### @kikojs/dom (patch)
  - remove dead code and speculative API, fix docs drift (dcc7cf6)

  ### @kikojs/router (patch)
  - remove dead code and speculative API, fix docs drift (dcc7cf6)

  ### @kikojs/signal (patch)
  - remove dead code and speculative API, fix docs drift (dcc7cf6)

## 0.0.6

### Patch Changes

- 78f7e8e: Add streaming SSR (`renderToStream`), signal serialization for SSR→hydration state transfer, `<style nonce>` support, and fragment root scope warning
