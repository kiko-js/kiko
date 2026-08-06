/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { Suspend } from "../src/flow"
import { lazy } from "../src/lazy"
import type { Component } from "../src/jsx-runtime"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("lazy", () => {
  it("renders the loaded component", async () => {
    const Card: Component<{ name: string }> = props => jsx("span", { children: props.name })
    const LazyCard = lazy(() => Promise.resolve(Card))
    const node = await LazyCard({ name: "kiko" })
    expect((node as HTMLElement).textContent).toBe("kiko")
  })

  it("loads the module once and caches the component", async () => {
    let loads = 0
    const Card: Component = () => jsx("span", { children: "card" })
    const LazyCard = lazy(() => {
      loads++
      return Promise.resolve(Card)
    })
    await LazyCard({})
    await LazyCard({})
    const node = await LazyCard({})
    expect(loads).toBe(1)
    expect((node as HTMLElement).textContent).toBe("card")
  })

  it("is single-flight under concurrent calls", async () => {
    let loads = 0
    const { promise, resolve } = Promise.withResolvers<Component>()
    const Card: Component = () => jsx("span", { children: "card" })
    const LazyCard = lazy(() => {
      loads++
      return promise
    })
    const a = LazyCard({})
    const b = LazyCard({})
    resolve(Card)
    const [na, nb] = await Promise.all([a, b])
    expect(loads).toBe(1)
    expect((na as HTMLElement).textContent).toBe("card")
    expect((nb as HTMLElement).textContent).toBe("card")
  })

  it("retries after a load failure", async () => {
    let loads = 0
    const Card: Component = () => jsx("span", { children: "card" })
    const LazyCard = lazy(() => {
      loads++
      return loads === 1 ? Promise.reject(new Error("network")) : Promise.resolve(Card)
    })
    await expect(LazyCard({})).rejects.toThrow("network")
    const node = await LazyCard({})
    expect(loads).toBe(2)
    expect((node as HTMLElement).textContent).toBe("card")
  })

  it("composes with Suspend as a JSX element", async () => {
    const { promise, resolve } = Promise.withResolvers<Component>()
    const Card: Component = () => jsx("span", { children: "card" })
    const LazyCard = lazy(() => promise)
    // <Suspend fallback={...}><Card /></Suspend> —— jsx(LazyCard) 返回 Promise<Node>
    const el = jsx("div", {
      children: Suspend({
        fallback: jsx("span", { children: "loading" }),
        children: jsx(LazyCard, {}),
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("loading")
    resolve(Card)
    await promise
    await flush()
    expect(el.textContent).toBe("card")
  })
})
