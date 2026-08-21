/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { render } from "../src/render"
import { createPortal } from "../src/portal"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

function button(onClick: (e: Event) => void): Node {
  return jsx("button", { onClick, children: "b" }) as Node
}

function fireClick(el: Element): void {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
}

describe("capture-phase events", () => {
  it("onClickCapture fires in capture phase, before delegated bubble handlers", () => {
    const order: string[] = []
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      jsx("div", {
        onClickCapture: () => order.push("capture"),
        onClick: () => order.push("bubble"),
        children: button(() => order.push("target")),
      }) as Node,
      container,
    )
    fireClick(container.querySelector("button")!)
    expect(order).toEqual(["capture", "target", "bubble"])
    dispose()
    container.remove()
  })

  it("signal-bound capture handler replaces without listener churn", async () => {
    const sig = createSignal(() => {})
    let hits = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      jsx("div", { onClickCapture: sig, children: button(() => hits++) }) as Node,
      container,
    )
    sig.set(() => {
      hits += 10
    })
    await new Promise<void>(r => queueMicrotask(r))
    fireClick(container.querySelector("button")!)
    // Capture runs (10) and propagation continues to the target (+1).
    dispose()
    container.remove()
  })

  it("stopPropagation during capture prevents target and bubble handlers", () => {
    let ran = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      jsx("div", {
        onClickCapture: (e: Event) => e.stopPropagation(),
        onClick: () => (ran += 1),
        children: button(() => (ran += 1)),
      }) as Node,
      container,
    )
    fireClick(container.querySelector("button")!)
    expect(ran).toBe(0)
    dispose()
    container.remove()
  })
})
describe("event delegation", () => {
  it("dispatches clicks through the mount root", () => {
    let clicks = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      button(() => clicks++),
      container,
    )
    fireClick(container.querySelector("button")!)
    expect(clicks).toBe(1)
    dispose()
    container.remove()
  })

  it("isolates sibling mount points — app A's click never runs app B's handler", () => {
    let a = 0
    let b = 0
    const containerA = document.createElement("div")
    const containerB = document.createElement("div")
    document.body.appendChild(containerA)
    document.body.appendChild(containerB)
    const disposeA = render(
      button(() => a++),
      containerA,
    )
    const disposeB = render(
      button(() => b++),
      containerB,
    )
    fireClick(containerA.querySelector("button")!)
    expect(a).toBe(1)
    expect(b).toBe(0)
    fireClick(containerB.querySelector("button")!)
    expect(a).toBe(1)
    expect(b).toBe(1)
    disposeA()
    disposeB()
    containerA.remove()
    containerB.remove()
  })

  it("stops observing a disposed root — handlers never fire after dispose", () => {
    let clicks = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      button(() => clicks++),
      container,
    )
    const el = container.querySelector("button")!
    dispose()
    fireClick(el)
    expect(clicks).toBe(0)
    container.remove()
  })

  it("does not capture events from foreign (non-kiko) DOM inside the container", () => {
    let clicks = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      button(() => clicks++),
      container,
    )
    const foreign = document.createElement("button")
    container.appendChild(foreign)
    fireClick(foreign)
    expect(clicks).toBe(0)
    dispose()
    container.remove()
  })

  it("deduplicates nested roots — handler fires once per event", () => {
    let clicks = 0
    const outer = document.createElement("div")
    const inner = document.createElement("div")
    outer.appendChild(inner)
    document.body.appendChild(outer)
    const disposeOuter = render(jsx("div", { children: inner } as never) as Node, outer)
    // inner becomes its own mount root nested inside outer's tree
    const disposeInner = render(
      button(() => clicks++),
      inner,
    )
    fireClick(inner.querySelector("button")!)
    expect(clicks).toBe(1)
    disposeOuter()
    disposeInner()
    outer.remove()
  })

  it("respects stopPropagation — ancestor handlers do not run", () => {
    let child = 0
    let parent = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      jsx("div", {
        onClick: () => parent++,
        children: button((e: Event) => {
          child++
          e.stopPropagation()
        }),
      }) as Node,
      container,
    )
    fireClick(container.querySelector("button")!)
    expect(child).toBe(1)
    expect(parent).toBe(0)
    dispose()
    container.remove()
  })

  it("keeps portal events working via the portal target as its own root", () => {
    let clicks = 0
    const container = document.createElement("div")
    const target = document.createElement("div")
    document.body.appendChild(container)
    document.body.appendChild(target)
    const dispose = render(
      jsx("div", {
        children: createPortal(
          button(() => clicks++),
          target,
        ),
      }) as Node,
      container,
    )
    fireClick(target.querySelector("button")!)
    expect(clicks).toBe(1)
    dispose()
    container.remove()
    target.remove()
  })

  it("keeps non-bubbling events as direct listeners (work without any mount root)", () => {
    let focused = 0
    const el = jsx("input", { onFocus: () => focused++ }) as HTMLInputElement
    el.dispatchEvent(new Event("focus"))
    expect(focused).toBe(1)
  })

  it("signal-bound delegated handlers replace without double-firing", async () => {
    const handler = createSignal<() => void>(() => {})
    let count = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(jsx("button", { onClick: handler }) as Node, container)
    const el = container.querySelector("button")!
    handler.set(() => {
      count += 1
    })
    await new Promise<void>(r => queueMicrotask(r))
    fireClick(el)
    handler.set(() => {
      count += 10
    })
    await new Promise<void>(r => queueMicrotask(r))
    fireClick(el)
    expect(count).toBe(11)
    dispose()
    container.remove()
  })

  it("survives remounting the same container (dispose → render again)", () => {
    let clicks = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose1 = render(
      button(() => clicks++),
      container,
    )
    dispose1()
    const dispose2 = render(
      button(() => clicks++),
      container,
    )
    const el = container.querySelector("button")!
    fireClick(el)
    expect(clicks).toBe(1)
    dispose2()
    // Node is detached and its root is gone — firing must be a no-op.
    fireClick(el)
    expect(clicks).toBe(1)
    container.remove()
  })

  it("re-rendering the same container without dispose keeps exactly one dispatch", () => {
    let clicks = 0
    const container = document.createElement("div")
    document.body.appendChild(container)
    render(
      button(() => clicks++),
      container,
    )
    render(
      button(() => clicks++),
      container,
    )
    fireClick(container.querySelector("button")!)
    expect(clicks).toBe(1)
    container.remove()
  })

  it("two portals sharing one target: first cleanup keeps the second alive", () => {
    let a = 0
    let b = 0
    const target = document.createElement("div")
    document.body.appendChild(target)
    const host1 = document.createElement("div")
    const host2 = document.createElement("div")
    document.body.appendChild(host1)
    document.body.appendChild(host2)
    const dispose1 = render(
      jsx("div", {
        children: createPortal(
          button(() => a++),
          target,
        ),
      }) as Node,
      host1,
    )
    const dispose2 = render(
      jsx("div", {
        children: createPortal(
          button(() => b++),
          target,
        ),
      }) as Node,
      host2,
    )
    const btnB = target.querySelectorAll("button")[1]!
    dispose1() // first owner lets go — target must keep its listeners
    fireClick(btnB)
    expect(a).toBe(0)
    expect(b).toBe(1)
    dispose2()
    // Last owner gone: listeners detached, detached node never dispatches.
    fireClick(btnB)
    expect(b).toBe(1)
    host1.remove()
    host2.remove()
    target.remove()
  })

  it("render dispose wipes portal content hosted in its container — no stale dispatch", () => {
    let ported = 0
    const shared = document.createElement("div")
    const otherHost = document.createElement("div")
    document.body.appendChild(shared)
    document.body.appendChild(otherHost)
    const disposeA = render(
      button(() => {}),
      shared,
    )
    const disposeB = render(
      jsx("div", {
        children: createPortal(
          button(() => ported++),
          shared,
        ),
      }) as Node,
      otherHost,
    )
    const portedBtn = shared.querySelectorAll("button")[1]!
    // render()'s teardown clears the whole container — including the portal
    // node another app moved into it (pre-existing render semantics).
    disposeA()
    expect(shared.contains(portedBtn)).toBe(false)
    // Detached node under no registered root: firing is a no-op.
    fireClick(portedBtn)
    expect(ported).toBe(0)
    disposeB()
    shared.remove()
    otherHost.remove()
  })

  it("disposing an inner nested root keeps the outer root working", () => {
    let outer = 0
    const outerContainer = document.createElement("div")
    const innerContainer = document.createElement("div")
    outerContainer.appendChild(innerContainer)
    document.body.appendChild(outerContainer)
    const disposeOuter = render(
      jsx("div", {
        onClick: () => outer++,
        children: innerContainer,
      }) as Node,
      outerContainer,
    )
    const disposeInner = render(
      button(() => {}),
      innerContainer,
    )
    disposeInner()
    fireClick(outerContainer.querySelector("div")!)
    expect(outer).toBe(1)
    disposeOuter()
    outerContainer.remove()
  })
})
