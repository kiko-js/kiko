# @kikojs/dom

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
