import { createWatcher, isSignal } from "./signal"
import type { WatchableSignal, Watcher } from "./signal"
import { trackCleanup, trackWatcher } from "./jsx-runtime"

// React/react-dom are optional peer deps; consumers of the `@kikojs/dom/react-portal`
// subpath opt into them. Top-level `import type` keeps this file type-checkable
// without runtime coupling and surfaces the dependency in the import graph.
import type * as React from "react"
import type * as ReactDOMClient from "react-dom/client"

/** Minimal structural shape of `react-dom/client`'s root handle. */
export interface ReactRoot {
  render(node: unknown): void
  unmount(): void
}

export function ReactPortal(props: Record<string, unknown>): HTMLElement {
  const { component: Component, ...rest } = props
  const container = document.createElement("div")

  // Disposed before the async import resolves — skip the render entirely.
  let disposed = false
  let root: ReactRoot | null = null
  const watchers: Watcher[] = []

  trackCleanup(container, () => {
    disposed = true
    watchers.length = 0
    if (root) {
      try {
        root.unmount()
      } catch {
        // React throws if the root is already unmounted — ignore.
      }
      root = null
    }
  })

  // React/react-dom are OPTIONAL peer deps — static import would force every
  // @kikojs/dom consumer to install them even if ReactPortal is never used.
  Promise.all([import("react"), import("react-dom/client")])
    .then(([ReactMod, ReactDOMMod]: [typeof React, typeof ReactDOMClient]) => {
      if (disposed) return

      root = ReactDOMMod.createRoot(container) as ReactRoot

      const getCurrentProps = () => {
        const p: Record<string, unknown> = {}
        for (const key of Object.keys(rest)) {
          const val = rest[key]
          p[key] = isSignal(val) ? (val as WatchableSignal<unknown>).get() : val
        }
        return p
      }

      const renderReact = () => {
        if (disposed || !root) return
        root.render(
          ReactMod.createElement(
            Component as React.ComponentType<Record<string, unknown>>,
            getCurrentProps(),
          ),
        )
      }

      renderReact()

      for (const key of Object.keys(rest)) {
        const val = rest[key]
        if (isSignal(val)) {
          const signal = val as WatchableSignal<unknown>
          const watcher = createWatcher(() => {
            queueMicrotask(() => {
              renderReact()
              watcher.watch(signal)
            })
          })
          watcher.watch(signal)
          watchers.push(watcher)
          trackWatcher(container, watcher)
        }
      }
    })
    .catch(err => {
      // Surface the failure instead of leaving an empty div. Throw async so the
      // caller's render() never blocks on a missing peer dependency.
      queueMicrotask(() => {
        if (disposed) return
        throw new Error(
          `ReactPortal requires "react" and "react-dom/client" to be installed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    })

  return container
}
