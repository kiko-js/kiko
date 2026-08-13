/**
 * Context API — fine-grained dependency injection for component trees.
 *
 * kiko components execute exactly once (no re-render cycle), so a context
 * value is read synchronously during the component's single execution.
 * Providers must therefore wrap their children in a function — the same
 * deferred-evaluation protocol `Show` / `For` / `ErrorBoundary` use: JSX
 * children are evaluated eagerly at the call site, BEFORE the provider
 * component runs, so eager children could never observe the provided value.
 *
 * The `Context` object itself is the provider component (React 19 style):
 *
 *   const Theme = createContext("light")
 *   <Theme value="dark">{() => <Button/>}</Theme>
 *
 * `value` may be a signal: consumers read it once during their body for the
 * initial render, or bind it directly into props/children where kiko's jsx
 * binding subscribes — fine-grained reactive updates with no re-render cycle:
 *
 *   const theme = useContext(Theme)          // WatchableSignal<string>
 *   return <div class={theme}>…</div>        // updates on signal change
 *
 * The lookup walks the provider stack top-down, so nested providers for the
 * same context override their ancestors and are restored on exit.
 */

export interface Context<T> {
  /** The provider component: renders `children()` inside the value's frame. */
  (props: { value: T; children?: unknown }): Node
  /** Unique identity used by `useContext` lookups. */
  readonly id: symbol
  /** Value `useContext` returns when no provider is in scope. */
  readonly defaultValue: T | undefined
}

/** Provider frames: one `Map` per active provider, innermost last. */
const stack: Array<Map<symbol, unknown>> = []

/** Create a context with an optional default value (returned when unprovided). */
export function createContext<T>(defaultValue?: T): Context<T> {
  const id = Symbol("kiko-context")

  const provider = ((props: { value: T; children?: unknown }): Node => {
    if (typeof props.children !== "function") {
      throw new TypeError(
        "Context provider children must be a function — JSX children evaluate " +
          "before the provider runs, so eager children can never see the value. " +
          "Wrap them in a thunk: <Ctx value={x}>{() => <Child/>}</Ctx>",
      )
    }
    stack.push(new Map([[id, props.value]]))
    try {
      return props.children() as Node
    } finally {
      stack.pop()
    }
  }) as Context<T> & { id: symbol; defaultValue: T | undefined }

  provider.id = id
  provider.defaultValue = defaultValue
  return provider
}

/** Read the nearest provided value for `ctx`, falling back to its default. */
export function useContext<T>(ctx: Context<T>): T | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i] as Map<symbol, unknown>
    if (frame.has(ctx.id)) return frame.get(ctx.id) as T
  }
  return ctx.defaultValue
}
