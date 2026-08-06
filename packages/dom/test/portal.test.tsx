/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx, cleanupWatchers } from "../src/jsx-runtime"
import { createPortal } from "../src/portal"
import { render } from "../src/render"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("createPortal", () => {
  it("moves the node into the container and leaves an anchor", () => {
    const host = jsx("div", {}) as HTMLElement
    const target = document.createElement("section")
    const anchor = createPortal(jsx("span", { id: "p", children: "hi" }), target)
    host.appendChild(anchor)

    expect(anchor.nodeType).toBe(Node.COMMENT_NODE)
    expect(host.querySelector("span")).toBeNull()
    expect(target.querySelector("#p")?.textContent).toBe("hi")
  })

  it("moves each child of a fragment into the container", () => {
    const target = document.createElement("section")
    const frag = document.createDocumentFragment()
    frag.appendChild(jsx("i", { children: "a" }))
    frag.appendChild(jsx("b", { children: "b" }))
    createPortal(frag, target)

    expect(target.childNodes.length).toBe(2)
    expect(target.textContent).toBe("ab")
  })

  it("signal children keep updating while portaled", async () => {
    const target = document.createElement("section")
    const count = createSignal(1)
    const anchor = createPortal(jsx("p", { id: "p", children: count }), target)

    expect(target.querySelector("#p")?.textContent).toBe("1")
    count.set(2)
    await flush()
    expect(target.querySelector("#p")?.textContent).toBe("2")

    cleanupWatchers(anchor)
    expect(target.querySelector("#p")).toBeNull()
  })

  it("disposes portaled nodes with the host tree via render", async () => {
    const target = document.createElement("section")
    const container = document.createElement("div")
    const sig = createSignal(0)
    const dispose = render(
      jsx("div", { children: createPortal(jsx("button", { children: sig }), target) }),
      container,
    )

    expect(target.querySelector("button")?.textContent).toBe("0")
    sig.set(5)
    await flush()
    expect(target.querySelector("button")?.textContent).toBe("5")

    dispose()
    expect(target.querySelector("button")).toBeNull()
    expect(container.textContent).toBe("")
  })
})
