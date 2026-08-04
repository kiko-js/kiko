/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { isSignal } from "../src/signal"
import { Show, For } from "../src/flow"
import { createStore } from "../../signal/src/store"
import { computed } from "../../signal/src/computed"
import { Signal } from "signal-polyfill"

beforeAll(async () => {
  await import("./setup")
})

function text(el: unknown): string {
  return (
    (el as HTMLElement)?.textContent ??
    (el as HTMLElement)?.innerHTML ??
    String(el ?? "")
  ).trim()
}

describe("store + dom integration", () => {
  // ── basic rendering ─────────────────────────────────────────────────

  it("renders leaf store values as text", () => {
    const store = createStore({ name: "Alice", age: 30 })
    const el = jsx("span", { children: store.name.signal }) as HTMLElement
    expect(text(el)).toBe("Alice")
  })

  it("updates DOM when store value changes", async () => {
    const store = createStore({ name: "Alice" })
    const el = jsx("span", { children: store.name.signal }) as HTMLElement
    expect(text(el)).toBe("Alice")

    store.name.set("Bob")
    await Promise.resolve()
    expect(text(el)).toBe("Bob")
  })

  it("multiple signals via computed work together", async () => {
    const store = createStore({ first: "Hello", last: "World" })
    const greeting = computed(() => `${store.first.get()} ${store.last.get()}`)
    const el = jsx("span", { children: greeting }) as HTMLElement
    expect(text(el)).toBe("Hello World")

    store.first.set("Hi")
    await Promise.resolve()
    expect(text(el)).toBe("Hi World")

    store.last.set("Earth")
    await Promise.resolve()
    expect(text(el)).toBe("Hi Earth")
  })

  // ── nested store access ─────────────────────────────────────────────

  it("renders deeply nested store values via a.b.c", async () => {
    const store = createStore({ a: { b: { c: 1 } } })
    const el = jsx("span", { children: store.a.b.c.signal }) as HTMLElement
    expect(text(el)).toBe("1")

    store.a.b.c.set(42)
    await Promise.resolve()
    expect(text(el)).toBe("42")
  })

  it("store nodes expose .signal at every level", () => {
    const store = createStore({ user: { name: "Alice" } })

    // store nodes are proxies, not raw signals — the underlying
    // Signal.State is exposed via the node's `.signal` property
    expect(isSignal(store.user)).toBe(false)
    expect(store.user instanceof Signal.State).toBe(false)

    expect(store.signal instanceof Signal.State).toBe(true)
    expect(store.user.signal instanceof Signal.State).toBe(true)
    expect(store.user.name.signal instanceof Signal.State).toBe(true)
    expect(isSignal(store.signal)).toBe(true)
    expect(isSignal(store.user.signal)).toBe(true)
    expect(isSignal(store.user.name.signal)).toBe(true)
  })

  it("nested store renders reactively when leaf changes", async () => {
    const store = createStore({ user: { name: "Alice" } })
    const el = jsx("span", { children: store.user.name.signal }) as HTMLElement
    expect(text(el)).toBe("Alice")

    store.user.name.set("Bob")
    await Promise.resolve()
    expect(text(el)).toBe("Bob")
  })

  it("parent replacement reactivity works with computed", async () => {
    // When a parent is replaced, reads go through the live store root, so
    // any accessor that re-reads the path on every evaluation stays fresh.
    const store = createStore({ user: { name: "Alice", age: 30 } })
    const name = computed(() => store.user.name.get())
    const el = jsx("span", { children: name }) as HTMLElement
    expect(text(el)).toBe("Alice")

    store.user.set({ name: "Bob", age: 25 })
    await Promise.resolve()
    expect(text(el)).toBe("Bob")
  })

  // ── props ───────────────────────────────────────────────────────────

  it("binds store signal to element property reactively", async () => {
    const store = createStore({ label: "initial" })
    const el = jsx("input", { value: store.label.signal }) as HTMLInputElement
    expect(el.value).toBe("initial")

    store.label.set("updated")
    await Promise.resolve()
    expect(el.value).toBe("updated")
  })

  it("binds store signal to className reactively", async () => {
    const store = createStore({ cls: "foo" })
    const el = jsx("div", { className: store.cls.signal }) as HTMLElement
    expect(el.className).toBe("foo")

    store.cls.set("bar")
    await Promise.resolve()
    expect(el.className).toBe("bar")
  })

  // ── control flow ────────────────────────────────────────────────────

  it("Show renders when store condition is truthy", async () => {
    const store = createStore({ visible: true })
    const el = jsx("div", {
      children: Show({
        when: store.visible.signal,
        children: jsx("span", { children: "shown" }),
        fallback: jsx("span", { children: "hidden" }),
      }),
    }) as HTMLElement
    expect(text(el)).toBe("shown")

    store.visible.set(false)
    await Promise.resolve()
    expect(text(el)).toBe("hidden")
  })

  it("For renders list from store array", () => {
    const store = createStore({ items: ["a", "b", "c"] })

    const el = jsx("ul", {
      children: For({
        each: store.items.signal!,
        children: (item: string) => jsx("li", { children: item }),
      }),
    }) as HTMLElement

    const items = el.querySelectorAll("li")
    expect(items.length).toBe(3)
    expect(items[0]!.textContent).toBe("a")
    expect(items[1]!.textContent).toBe("b")
    expect(items[2]!.textContent).toBe("c")
  })

  it("For updates when store array changes", async () => {
    const store = createStore({ items: ["x"] })

    const el = jsx("ul", {
      children: For({
        each: store.items.signal!,
        children: (item: string) => jsx("li", { children: item }),
      }),
    }) as HTMLElement

    expect(el.querySelectorAll("li").length).toBe(1)

    store.items.set(["x", "y", "z"])
    await Promise.resolve()
    expect(el.querySelectorAll("li").length).toBe(3)
  })

  // ── fine-grained reactivity ─────────────────────────────────────────

  it("changing sibling does not re-render unrelated elements", async () => {
    const store = createStore({ name: "Alice", age: 30 })

    let ageRenderCount = 0
    const ageDisplay = computed(() => {
      ageRenderCount++
      return store.age.get()
    })

    const nameEl = jsx("span", { children: store.name.signal }) as HTMLElement
    const ageEl = jsx("span", { children: ageDisplay }) as HTMLElement

    await Promise.resolve()
    const initialAgeRenders = ageRenderCount

    store.name.set("Bob")
    await Promise.resolve()

    expect(text(nameEl)).toBe("Bob")
    expect(text(ageEl)).toBe("30")
    expect(ageRenderCount).toBe(initialAgeRenders)
  })

  // ── upward propagation ─────────────────────────────────────────────

  it("descendant change propagates upward via store.get()", async () => {
    const store = createStore({ user: { name: "Alice", age: 30 } })

    let parentRenderCount = 0
    // Use computed + store.user.get() to track the entire subtree.
    // store.user.get() bumps when any descendant changes.
    const userDisplay = computed(() => {
      parentRenderCount++
      return JSON.stringify(store.user.get())
    })

    const el = jsx("span", { children: userDisplay }) as HTMLElement
    await Promise.resolve()
    const initialCount = parentRenderCount

    store.user.age.set(99)
    await Promise.resolve()

    // store.user.get() triggers re-evaluation because descendant bump
    // propagates upward to store.user's version counter
    expect(parentRenderCount).toBeGreaterThan(initialCount)
    expect(text(el)).toContain("99")
  })

  // ── dangling reference protection ───────────────────────────────────

  it("old store references read fresh values after parent replacement", async () => {
    const store = createStore({ a: { b: 1 } })
    const oldA = store.a

    store.a.set({ b: 2 })
    await Promise.resolve()

    // Reads go through the live store root, so previously captured
    // references are never detached
    expect(oldA.b.get()).toBe(2)

    const el = jsx("span", { children: store.a.b.signal }) as HTMLElement
    expect(text(el)).toBe("2")
  })

  // ── multiple store instances ────────────────────────────────────────

  it("independent stores do not interfere", async () => {
    const s1 = createStore({ x: 1 })
    const s2 = createStore({ x: 100 })

    const el1 = jsx("span", { children: s1.x.signal }) as HTMLElement
    const el2 = jsx("span", { children: s2.x.signal }) as HTMLElement

    expect(text(el1)).toBe("1")
    expect(text(el2)).toBe("100")

    s1.x.set(2)
    await Promise.resolve()
    expect(text(el1)).toBe("2")
    expect(text(el2)).toBe("100")

    s2.x.set(200)
    await Promise.resolve()
    expect(text(el1)).toBe("2")
    expect(text(el2)).toBe("200")
  })
})
