/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { ErrorBoundary } from "../src/flow"
import { createSignal } from "../src/signal"
import { Signal } from "signal-polyfill"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

const Throw = (): Node => {
  throw new Error("boom")
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    const el = jsx("div", {
      children: ErrorBoundary({ children: () => jsx("span", { children: "ok" }) }),
    }) as HTMLElement
    expect(el.textContent).toBe("ok")
  })

  it("catches initial render error and swaps to fallback", () => {
    const el = jsx("div", {
      children: ErrorBoundary({
        fallback: jsx("span", { children: "caught" }),
        children: () => jsx(Throw, {}),
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("caught")
  })

  it("passes the error to a fallback function", () => {
    const el = jsx("div", {
      children: ErrorBoundary({
        fallback: (e: unknown) => jsx("span", { children: `err: ${(e as Error).message}` }),
        children: () => jsx(Throw, {}),
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("err: boom")
  })

  it("fires onError with the thrown value", () => {
    let captured: unknown = null
    jsx("div", {
      children: ErrorBoundary({
        onError: (e: unknown) => {
          captured = e
        },
        fallback: null,
        children: () => {
          throw new Error("cb")
        },
      }),
    })
    expect((captured as Error)?.message).toBe("cb")
  })

  it("catches a signal-driven re-render error", async () => {
    const s = createSignal(0)
    const Comp = (): Node => {
      const v = s.get()
      if (v === 2) throw new Error("re-render boom")
      return jsx("span", { children: `v=${v}` }) as Node
    }
    const el = jsx("div", {
      children: ErrorBoundary({
        fallback: jsx("span", { children: "fallback" }),
        children: Comp,
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("v=0")
    s.set(1)
    await flush()
    expect(el.textContent).toBe("v=1")
    s.set(2)
    await flush()
    expect(el.textContent).toBe("fallback")
  })

  it("retries children after reset clears the error", async () => {
    const s = createSignal(0)
    const Comp = (): Node => {
      const v = s.get()
      if (v === 2) throw new Error("boom")
      return jsx("span", { children: `v=${v}` }) as Node
    }
    const reset = new Signal.State<unknown>(0)
    const el = jsx("div", {
      children: ErrorBoundary({
        resetSignal: reset,
        fallback: jsx("span", { children: "fb" }),
        children: Comp,
      }),
    }) as HTMLElement
    s.set(2)
    await flush()
    expect(el.textContent).toBe("fb")
    // Fix the cause, then write a distinct value to resetSignal to retry.
    s.set(5)
    await flush()
    reset.set(Date.now())
    await flush()
    await flush()
    expect(el.textContent).toBe("v=5")
  })

  it("disposes children watchers when swapping to fallback", async () => {
    const s = createSignal("orig")
    let renderCount = 0
    const Comp = (): Node => {
      renderCount++
      if (renderCount === 2) throw new Error("boom")
      return jsx("span", { children: s }) as Node
    }
    const el = jsx("div", {
      children: ErrorBoundary({
        fallback: jsx("span", { children: "fb" }),
        children: Comp,
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("orig")
    s.set("trigger-throw")
    await flush()
    expect(el.textContent).toBe("fb")
    // The disposed children binding must not mutate the fallback DOM.
    s.set("after")
    await flush()
    expect(el.textContent).toBe("fb")
  })

  it("isolates errors to the nearest boundary (nested)", async () => {
    const inner = createSignal(0)
    const Inner = (): Node => {
      if (inner.get() === 1) throw new Error("inner boom")
      return jsx("span", { children: "inner-ok" }) as Node
    }
    const outerSeen: unknown[] = []
    const el = jsx("div", {
      children: ErrorBoundary({
        fallback: () => jsx("span", { children: "outer-fb" }),
        onError: (e: unknown) => outerSeen.push(e),
        children: () =>
          jsx("section", {
            children: ErrorBoundary({
              fallback: () => jsx("span", { children: "inner-fb" }),
              children: Inner,
            }),
          }),
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("inner-ok")
    inner.set(1)
    await flush()
    // Inner boundary catches its own error; outer never sees it.
    expect(el.textContent).toBe("inner-fb")
    expect(outerSeen).toEqual([])
  })
})
