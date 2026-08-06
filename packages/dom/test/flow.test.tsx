/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { jsx, cleanupWatchers } from "../src/jsx-runtime"
import { Show, For } from "../src/flow"
import { Signal } from "signal-polyfill"
import { createSignal } from "../src/signal"

beforeAll(async () => {
  await import("./setup")
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe("signal child — structural", () => {
  it("renders a signal whose value is an Element", async () => {
    const spanA = jsx("span", { id: "a", children: "A" })
    const spanB = jsx("span", { id: "b", children: "B" })
    const which = createSignal<Node>(spanA)
    const el = jsx("div", { children: which }) as HTMLElement
    expect(el.querySelector("#a")?.textContent).toBe("A")
    which.set(spanB)
    await flush()
    expect(el.querySelector("#a")).toBeNull()
    expect(el.querySelector("#b")?.textContent).toBe("B")
  })

  it("swaps nodes and cleans up the old inner watchers", async () => {
    const node = createSignal<Node>(jsx("p", { children: "first" }))
    const el = jsx("div", { children: node }) as HTMLElement
    expect(el.textContent).toBe("first")
    node.set(jsx("p", { children: "second" }))
    await flush()
    expect(el.textContent).toBe("second")
  })

  it("cleans up inner watchers when the swapped-out node is replaced", async () => {
    const which = createSignal(true)
    const inner = createSignal("hello")
    const p = jsx("p", { children: inner })
    const gone = jsx("p", { children: "gone" })
    const node = createSignal<Node>(p)
    const el = jsx("div", { children: node }) as HTMLElement
    expect(el.textContent).toBe("hello")
    inner.set("world")
    await flush()
    expect(el.textContent).toBe("world")
    node.set(gone)
    await flush()
    expect(el.textContent).toBe("gone")
    // old inner-watcher is gone: mutating inner must not affect DOM
    inner.set("x")
    await flush()
    expect(el.textContent).toBe("gone")
    void which
  })

  it("renders a signal whose value is null as nothing", async () => {
    const v = createSignal<unknown>(null)
    const el = jsx("div", { children: v }) as HTMLElement
    expect(el.textContent).toBe("")
    v.set("text")
    await flush()
    expect(el.textContent).toBe("text")
    v.set(null)
    await flush()
    expect(el.textContent).toBe("")
  })

  it("renders a signal whose value is an array in order", async () => {
    const v = createSignal<unknown[]>([
      jsx("span", { children: "x" }),
      jsx("span", { children: "y" }),
      jsx("span", { children: "z" }),
    ])
    const el = jsx("div", { children: v }) as HTMLElement
    expect(Array.from(el.children).map(c => c.textContent)).toEqual(["x", "y", "z"])
    v.set([jsx("p", { children: "z" })])
    await flush()
    expect(el.children.length).toBe(1)
    expect(el.querySelector("p")?.textContent).toBe("z")
  })
})

describe("Show", () => {
  it("renders children when truthy, fallback when falsy", () => {
    const show = createSignal(true)
    const el = jsx("div", {
      children: Show({ when: show, fallback: "none", children: "yes" }),
    }) as HTMLElement
    expect(el.textContent).toBe("yes")
  })

  it("renders fallback when falsy from the very first render", () => {
    // 回归：此前客户端首次 falsy 渲染为空，而 SSR 输出 fallback —— 语义不一致。
    // 与 ssrShow / hydrateShow 保持一致：falsy 时渲染 fallback。
    const el = jsx("div", {
      children: Show({ when: false, fallback: "none", children: "yes" }),
    }) as HTMLElement
    expect(el.textContent).toBe("none")
  })

  it("renders fallback when the when-signal starts falsy", async () => {
    const show = createSignal(false)
    const el = jsx("div", {
      children: Show({ when: show, fallback: "none", children: "yes" }),
    }) as HTMLElement
    expect(el.textContent).toBe("none")
    show.set(true)
    await flush()
    expect(el.textContent).toBe("yes")
    show.set(false)
    await flush()
    expect(el.textContent).toBe("none")
  })

  it("swaps to fallback when the signal flips false", async () => {
    const show = createSignal(true)
    const el = jsx("div", {
      children: Show({ when: show, fallback: "none", children: "yes" }),
    }) as HTMLElement
    expect(el.textContent).toBe("yes")
    show.set(false)
    await flush()
    expect(el.textContent).toBe("none")
    show.set(true)
    await flush()
    expect(el.textContent).toBe("yes")
  })

  it("passes the truthy value to a function child", () => {
    const user = createSignal<{ name: string } | null>({ name: "Ada" })
    const el = jsx("div", {
      children: Show({
        when: user,
        children: (u: { name: string }) => `Hi ${u.name}`,
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("Hi Ada")
  })

  it("renders nothing when falsy and no fallback", () => {
    const show = createSignal(false)
    const el = jsx("div", {
      children: Show({ when: show, children: "yes" }),
    }) as HTMLElement
    expect(el.textContent).toBe("")
  })

  it("cleans up on dispose", async () => {
    const show = createSignal(true)
    const inner = createSignal("v")
    const container = document.createElement("div")
    const el = jsx("div", {
      children: Show({ when: show, children: jsx("p", { children: inner }) }),
    }) as HTMLElement
    container.appendChild(el)
    inner.set("v2")
    await flush()
    expect(el.textContent).toBe("v2")
    cleanupWatchers(container)
    inner.set("v3")
    await flush()
    expect(el.textContent).toBe("v2")
  })
})

describe("For", () => {
  it("renders a static list", () => {
    const el = jsx("ul", {
      children: For({
        each: ["a", "b", "c"],
        children: item => jsx("li", { children: item }),
      }),
    }) as HTMLElement
    expect(Array.from(el.querySelectorAll("li")).map(li => li.textContent)).toEqual(["a", "b", "c"])
  })

  it("re-renders when the each-signal changes", async () => {
    const list = createSignal<string[]>(["a", "b"])
    const el = jsx("ul", {
      children: For({
        each: list,
        children: item => jsx("li", { children: item }),
      }),
    }) as HTMLElement
    expect(Array.from(el.querySelectorAll("li")).map(li => li.textContent)).toEqual(["a", "b"])
    list.set(["x", "y", "z"])
    await flush()
    expect(Array.from(el.querySelectorAll("li")).map(li => li.textContent)).toEqual(["x", "y", "z"])
    list.set(["only"])
    await flush()
    expect(Array.from(el.querySelectorAll("li")).map(li => li.textContent)).toEqual(["only"])
  })

  it("passes an index accessor", () => {
    const seen: [string, number][] = []
    jsx("ul", {
      children: For({
        each: ["a", "b"],
        children: (item, index) => {
          seen.push([item, index()])
          return jsx("li", { children: item })
        },
      }),
    })
    expect(seen).toEqual([
      ["a", 0],
      ["b", 1],
    ])
  })

  it("cleans up item watchers when the list shrinks", async () => {
    const list = createSignal<number[]>([1, 2])
    const itemSig = createSignal("orig")
    const el = jsx("ul", {
      children: For({
        each: list,
        children: () => jsx("li", { children: itemSig }),
      }),
    }) as HTMLElement
    expect(Array.from(el.querySelectorAll("li")).map(li => li.textContent)).toEqual([
      "orig",
      "orig",
    ])
    itemSig.set("new")
    await flush()
    expect(Array.from(el.querySelectorAll("li")).map(li => li.textContent)).toEqual(["new", "new"])
    list.set([1])
    await flush()
    expect(el.querySelectorAll("li").length).toBe(1)
    // remaining item still reactive
    itemSig.set("again")
    await flush()
    expect(el.querySelector("li")?.textContent).toBe("again")
  })

  it("getKey reuses DOM nodes by key and updates in place", async () => {
    const list = createSignal<{ id: number; v: string }[]>([
      { id: 1, v: "a" },
      { id: 2, v: "b" },
    ])
    const el = jsx("ul", {
      children: For({
        each: list,
        getKey: item => item.id,
        children: item => {
          // accessor: the fn runs once per key; a derived computed binds
          // `.v` as a signal child so updates propagate in place.
          const v = new Signal.Computed(() => item().v)
          const li = document.createElement("li") as HTMLElement
          li.appendChild(jsx("span", { children: v }) as HTMLElement)
          return li
        },
      }),
    }) as HTMLElement
    const texts = () => Array.from(el.querySelectorAll("li span")).map(s => s.textContent)
    // Keyed in-place update is two microtasks: For's render sets the entry
    // state, then the span's watcher re-reads the derived accessor.
    const sync = async (): Promise<void> => {
      await flush()
      await flush()
    }
    expect(texts()).toEqual(["a", "b"])

    // Update value of id=1 without changing keys: node reused, fn NOT re-run.
    list.set([
      { id: 1, v: "A" },
      { id: 2, v: "b" },
    ])
    await sync()
    expect(texts()).toEqual(["A", "b"])

    // Reorder: same keys, new order — DOM nodes move, no re-create.
    const liBefore = el.querySelectorAll("li")[1]
    list.set([
      { id: 2, v: "b" },
      { id: 1, v: "A" },
    ])
    await sync()
    expect(texts()).toEqual(["b", "A"])
    expect(el.querySelectorAll("li")[0]).toBe(liBefore)

    // Insert a new key in the middle.
    list.set([
      { id: 2, v: "b" },
      { id: 3, v: "c" },
      { id: 1, v: "A" },
    ])
    await sync()
    expect(texts()).toEqual(["b", "c", "A"])

    // Remove a key — its subtree disposed.
    list.set([{ id: 1, v: "A" }])
    await sync()
    expect(texts()).toEqual(["A"])
  })

  it("getKey index accessor is signalized: reorders update index bindings", async () => {
    // 回归：idx 曾是非信号字段，同一对象引用移动位置时（state.set 相等跳过）
    // 绑定 index 的 computed 不重算，重排后索引显示旧值。
    const items = [
      { id: 1, v: "a" },
      { id: 2, v: "b" },
    ]
    const list = createSignal(items)
    const el = jsx("ul", {
      children: For({
        each: list,
        getKey: item => item.id,
        children: (item, index) => {
          const text = new Signal.Computed(() => `${item().v}:${index()}`)
          const li = document.createElement("li") as HTMLElement
          li.appendChild(jsx("span", { children: text }) as HTMLElement)
          return li
        },
      }),
    }) as HTMLElement
    const texts = () => Array.from(el.querySelectorAll("li span")).map(s => s.textContent)
    const sync = async (): Promise<void> => {
      await flush()
      await flush()
    }
    expect(texts()).toEqual(["a:0", "b:1"])

    // 同一引用交换位置：state 相等跳过，但 idx 信号变化必须驱动重算
    list.set([items[1]!, items[0]!])
    await sync()
    expect(texts()).toEqual(["b:0", "a:1"])

    // 再插入：新 key 占 index 0，原 index 0 → 1
    list.set([{ id: 3, v: "c" }, items[1]!, items[0]!])
    await sync()
    expect(texts()).toEqual(["c:0", "b:1", "a:2"])
  })
})
