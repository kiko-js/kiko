/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx, cleanupWatchers } from "../src/jsx-runtime"
import { Suspend } from "../src/flow"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("Suspend", () => {
  it("shows fallback while a promise child is pending", async () => {
    const { promise, resolve } = Promise.withResolvers<Node>()
    const el = jsx("div", {
      children: Suspend({ fallback: jsx("span", { children: "loading" }), children: promise }),
    }) as HTMLElement
    expect(el.textContent).toBe("loading")
    resolve(jsx("span", { children: "loaded" }))
    await promise
    await flush()
    expect(el.textContent).toBe("loaded")
  })

  it("shows fallback while a promise array is pending", async () => {
    const { promise: a, resolve: ra } = Promise.withResolvers<Node>()
    const { promise: b, resolve: rb } = Promise.withResolvers<Node>()
    const el = jsx("div", {
      children: Suspend({
        fallback: jsx("span", { children: "loading" }),
        children: [a, b],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("loading")
    ra(jsx("span", { children: "A" }))
    await flush()
    expect(el.textContent).toBe("loading")
    rb(jsx("span", { children: "B" }))
    await Promise.all([a, b])
    await flush()
    expect(el.textContent).toBe("AB")
  })

  it("renders plain node children immediately", () => {
    const el = jsx("div", {
      children: Suspend({
        fallback: jsx("span", { children: "loading" }),
        children: jsx("span", { children: "ok" }),
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("ok")
  })

  it("renders plain node array children immediately", () => {
    const el = jsx("div", {
      children: Suspend({
        fallback: jsx("span", { children: "loading" }),
        children: [jsx("span", { children: "a" }), jsx("span", { children: "b" })],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("ab")
  })

  it("does not update DOM after cleanup", async () => {
    const { promise, resolve } = Promise.withResolvers<Node>()
    const container = document.createElement("div")
    const el = jsx("div", {
      children: Suspend({ fallback: jsx("span", { children: "loading" }), children: promise }),
    }) as HTMLElement
    container.appendChild(el)
    cleanupWatchers(container)
    resolve(jsx("span", { children: "loaded" }))
    await promise
    await flush()
    expect(el.textContent).toBe("loading")
  })

  it("keeps fallback on async rejection", async () => {
    const reported: unknown[] = []
    const originalReportError = globalThis.reportError
    // @ts-ignore
    globalThis.reportError = (e: unknown) => {
      reported.push(e)
    }
    try {
      const { promise, reject } = Promise.withResolvers<Node>()
      const el = jsx("div", {
        children: Suspend({ fallback: jsx("span", { children: "loading" }), children: promise }),
      }) as HTMLElement
      expect(el.textContent).toBe("loading")
      reject(new Error("boom"))
      await promise.catch(() => {})
      await flush()
      expect(el.textContent).toBe("loading")
      expect(reported.length).toBe(1)
      expect((reported[0] as Error).message).toBe("boom")
    } finally {
      // @ts-ignore
      globalThis.reportError = originalReportError
    }
  })

  it("keeps fallback if any promise in an array rejects", async () => {
    const reported: unknown[] = []
    const originalReportError = globalThis.reportError
    // @ts-ignore
    globalThis.reportError = (e: unknown) => {
      reported.push(e)
    }
    try {
      const { promise: a, resolve: ra } = Promise.withResolvers<Node>()
      const { promise: b, reject: rb } = Promise.withResolvers<Node>()
      const el = jsx("div", {
        children: Suspend({
          fallback: jsx("span", { children: "loading" }),
          children: [a, b],
        }),
      }) as HTMLElement
      expect(el.textContent).toBe("loading")
      ra(jsx("span", { children: "A" }))
      rb(new Error("b failed"))
      await Promise.all([a.catch(() => {}), b.catch(() => {})])
      await flush()
      expect(el.textContent).toBe("loading")
      expect(reported.length).toBe(1)
      expect((reported[0] as Error).message).toBe("b failed")
    } finally {
      // @ts-ignore
      globalThis.reportError = originalReportError
    }
  })

  it("renders an async component used as JSX child inside Suspend", async () => {
    const { promise, resolve } = Promise.withResolvers<Node>()
    const AsyncComp = async (): Promise<Node> => promise
    const el = jsx("div", {
      children: Suspend({
        fallback: jsx("span", { children: "loading" }),
        // @ts-expect-error async component returns Promise<Node>, not Node
        children: jsx(AsyncComp, {}),
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("loading")
    resolve(jsx("span", { children: "loaded" }))
    await promise
    await flush()
    expect(el.textContent).toBe("loaded")
  })

  it("renders an array of async JSX components", async () => {
    const { promise: a, resolve: ra } = Promise.withResolvers<Node>()
    const { promise: b, resolve: rb } = Promise.withResolvers<Node>()
    const AsyncA = async (): Promise<Node> => a
    const AsyncB = async (): Promise<Node> => b
    const el = jsx("div", {
      children: Suspend({
        fallback: jsx("span", { children: "loading" }),
        // @ts-expect-error async components return Promise<Node>
        children: [jsx(AsyncA, {}), jsx(AsyncB, {})],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("loading")
    ra(jsx("span", { children: "A" }))
    rb(jsx("span", { children: "B" }))
    await Promise.all([a, b])
    await flush()
    expect(el.textContent).toBe("AB")
  })

  it("handles a mixed array of promises and plain nodes", async () => {
    const { promise, resolve } = Promise.withResolvers<Node>()
    const el = jsx("div", {
      children: Suspend({
        fallback: jsx("span", { children: "loading" }),
        children: [jsx("span", { children: "plain-" }), promise],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("loading")
    resolve(jsx("span", { children: "async" }))
    await promise
    await flush()
    expect(el.textContent).toBe("plain-async")
  })
})
