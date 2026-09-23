/** @jsxImportSource @kikojs/dom */
/**
 * 快照过期回归:嵌套控制流(Show-in-Show、signal 子节点持有控制流、For 条目
 * 持有控制流)中,内层先换出会让外层快照持有已脱离节点——外层随后换出时
 * `removeChild` 抛 NotFoundError,或漏掉内层新节点导致内容残留。
 * 修复依赖 jsx-runtime 的快照注册表(swap 时按 old 反查宿主数组补丁)。
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { jsx } from "../src/jsx-runtime"
import { Show, For } from "../src/flow"
import { createSignal } from "../src/signal"
import { renderToFragment, ssrRuntime } from "../src/ssr"
import { setSSRRuntime } from "../src/ssr-mode"
import { hydrate } from "../src/hydrate"

beforeAll(async () => {
  await import("./setup")
})

afterAll(() => {
  setSSRRuntime(null)
})

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

type Item = { id: number; on?: { get(): boolean } }

describe("nested control-flow snapshot staleness", () => {
  it("client: inner Show swaps first, then outer (function children)", async () => {
    const outerOn = createSignal(true)
    const innerOn = createSignal(true)
    const el = jsx("div", {
      children: Show({
        when: outerOn as never,
        fallback: "outer-off",
        children: () => [
          "[",
          Show({ when: innerOn as never, fallback: "inner-off", children: "inner-on" }),
          "]",
        ],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("[inner-on]")

    innerOn.set(false)
    await flush()
    expect(el.textContent).toBe("[inner-off]")

    outerOn.set(false)
    await flush()
    // 修复前:swapBranch 对外层快照里已脱离的内层旧节点 removeChild 抛错,
    // 且内层新节点残留(inner-off 与 fallback 并存)
    expect(el.textContent).toBe("outer-off")

    outerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[inner-off]")
  })

  it("client: same shape with static children", async () => {
    const outerOn = createSignal(true)
    const innerOn = createSignal(true)
    const el = jsx("div", {
      children: Show({
        when: outerOn as never,
        fallback: "outer-off",
        children: ["[", Show({ when: innerOn as never, fallback: "ioff", children: "ion" }), "]"],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("[ion]")

    innerOn.set(false)
    await flush()
    expect(el.textContent).toBe("[ioff]")

    outerOn.set(false)
    await flush()
    expect(el.textContent).toBe("outer-off")

    outerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[ioff]")
  })

  it("client: outer swaps first (control order)", async () => {
    const outerOn = createSignal(true)
    const innerOn = createSignal(true)
    const el = jsx("div", {
      children: Show({
        when: outerOn as never,
        fallback: "outer-off",
        children: () => [
          "[",
          Show({ when: innerOn as never, fallback: "inner-off", children: "inner-on" }),
          "]",
        ],
      }),
    }) as HTMLElement

    outerOn.set(false)
    await flush()
    expect(el.textContent).toBe("outer-off")
    innerOn.set(false)
    await flush()
    expect(el.textContent).toBe("outer-off")
    outerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[inner-off]")
  })

  it("hydrate: adopt SSR html, inner swaps first, then outer", async () => {
    setSSRRuntime(ssrRuntime)
    const container = document.createElement("div")
    try {
      container.innerHTML = await renderToFragment(() =>
        Show({
          when: true,
          fallback: "outer-off",
          children: () => [
            "[",
            Show({ when: true, fallback: "inner-off", children: "inner-on" }),
            "]",
          ],
        }),
      )
    } finally {
      setSSRRuntime(null)
    }

    const outerOn = createSignal(true)
    const innerOn = createSignal(true)
    const dispose = hydrate(
      () =>
        Show({
          when: outerOn as never,
          fallback: "outer-off",
          children: () => [
            "[",
            Show({ when: innerOn as never, fallback: "inner-off", children: "inner-on" }),
            "]",
          ],
        }),
      container,
    )
    expect(container.textContent).toBe("[inner-on]")

    innerOn.set(false)
    await flush()
    expect(container.textContent).toBe("[inner-off]")

    // 修复前:hydrateShow 的 branches.current 持有已脱离的内层旧节点,
    // 外层换出时 removeChild 抛 DOMException
    outerOn.set(false)
    await flush()
    expect(container.textContent).toBe("outer-off")

    outerOn.set(true)
    await flush()
    expect(container.textContent).toBe("[inner-off]")
    dispose()
  })

  it("signal child holding a Show: inner swaps, then signal rebinds", async () => {
    const innerOn = createSignal(true)
    const which = createSignal<unknown>([
      "[",
      Show({ when: innerOn as never, fallback: "in-off", children: "in-on" }),
      "]",
    ])
    const el = jsx("div", { children: which }) as HTMLElement
    expect(el.textContent).toBe("[in-on]")

    innerOn.set(false)
    await flush()
    expect(el.textContent).toBe("[in-off]")

    // 修复前:signal 快照持有已脱离节点,swapNodes 抛错被 watcher 吞掉,
    // 换绑结果不生效(内容停在旧值)
    which.set(["fresh"])
    await flush()
    expect(el.textContent).toBe("fresh")
  })

  it("For item holding a Show: inner swaps, then item dropped", async () => {
    const innerOn = createSignal(true)
    const items = createSignal<Item[]>([{ id: 1, on: innerOn as never }, { id: 2 }])
    const el = jsx("div", {
      children: For({
        each: items,
        getKey: (x: Item) => x.id,
        children: (get: () => Item) => {
          const item = get()
          return [
            `${item.id}:`,
            item.on ? Show({ when: item.on as never, fallback: "off", children: "on" }) : "plain",
          ]
        },
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("1:on2:plain")

    innerOn.set(false)
    await flush()
    expect(el.textContent).toBe("1:off2:plain")

    // 修复前:条目快照持有已脱离的内层旧节点,drop 时 reconcile removeChild 抛错
    items.set([{ id: 2 }])
    await flush()
    expect(el.textContent).toBe("2:plain")
  })

  it("hidden fragment: outer static branch away, inner flips, outer back", async () => {
    const outerOn = createSignal(true)
    const innerOn = createSignal(true)
    const el = jsx("div", {
      children: Show({
        when: outerOn as never,
        fallback: "outer-off",
        children: [
          "[",
          Show({ when: innerOn as never, fallback: "in-off", children: "in-on" }),
          "]",
        ],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("[in-on]")

    outerOn.set(false)
    await flush()
    expect(el.textContent).toBe("outer-off")

    // 内层在外层保留期(节点脱离文档)切换:补丁写入外层保留快照
    innerOn.set(false)
    await flush()

    outerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[in-off]")

    // 还魂后内层再切换:此时内层 current 与 DOM 必须一致
    innerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[in-on]")
  })

  // 重登记缺口:补丁只 splice 不重登记,宿主数组停在补丁前的元素上,
  // 第二次内层换出按新节点反查漏掉宿主,外层快照再度过期。
  it("inner flips twice while outer visible, then outer swaps", async () => {
    const outerOn = createSignal(true)
    const innerOn = createSignal(true)
    const el = jsx("div", {
      children: Show({
        when: outerOn as never,
        fallback: "outer-off",
        children: [
          "[",
          Show({ when: innerOn as never, fallback: "in-off", children: "in-on" }),
          "]",
        ],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("[in-on]")

    innerOn.set(false)
    await flush()
    innerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[in-on]")

    outerOn.set(false)
    await flush()
    expect(el.textContent).toBe("outer-off")

    outerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[in-on]")
  })

  it("inner flips twice while outer retained away, then outer back", async () => {
    const outerOn = createSignal(true)
    const innerOn = createSignal(true)
    const el = jsx("div", {
      children: Show({
        when: outerOn as never,
        fallback: "outer-off",
        children: [
          "[",
          Show({ when: innerOn as never, fallback: "in-off", children: "in-on" }),
          "]",
        ],
      }),
    }) as HTMLElement
    expect(el.textContent).toBe("[in-on]")

    outerOn.set(false)
    await flush()
    expect(el.textContent).toBe("outer-off")

    // 保留期内两次切换:两次都必须写进外层保留快照
    innerOn.set(false)
    await flush()
    innerOn.set(true)
    await flush()

    outerOn.set(true)
    await flush()
    expect(el.textContent).toBe("[in-on]")
  })
})
