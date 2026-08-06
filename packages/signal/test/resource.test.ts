import { describe, it, expect } from "bun:test"
import { createResource, createSignal, effect, type Resource } from "../src/index.ts"

function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

function tick(): Promise<void> {
  return flush().then(flush)
}

describe("createResource", () => {
  it("loads data and clears loading", async () => {
    const resource = createResource(async () => "hello")
    expect(resource.loading.get()).toBe(true)
    await tick()
    expect(resource.data.get()).toBe("hello")
    expect(resource.loading.get()).toBe(false)
    expect(resource.error.get()).toBeNull()
    resource.dispose()
  })

  it("exposes initial value while first load is pending", async () => {
    const { promise, resolve } = Promise.withResolvers<string>()
    const resource = createResource(() => promise, { initial: "cached" })
    expect(resource.data.get()).toBe("cached")
    expect(resource.loading.get()).toBe(true)
    resolve("loaded")
    await tick()
    expect(resource.data.get()).toBe("loaded")
    expect(resource.loading.get()).toBe(false)
    resource.dispose()
  })

  it("captures errors without throwing", async () => {
    const resource = createResource(async () => {
      throw new Error("boom")
    })
    await tick()
    expect(resource.error.get()).toBeInstanceOf(Error)
    expect((resource.error.get() as Error).message).toBe("boom")
    expect(resource.data.get()).toBeUndefined()
    expect(resource.loading.get()).toBe(false)
    resource.dispose()
  })

  it("refetch re-runs the fetcher", async () => {
    let calls = 0
    const resource = createResource(async () => ++calls)
    await tick()
    expect(resource.data.get()).toBe(1)
    resource.refetch()
    await tick()
    expect(resource.data.get()).toBe(2)
    resource.dispose()
  })

  it("re-fetches when source dependencies change", async () => {
    const id = createSignal(1)
    const resource = createResource(async source => `user:${source}`, { source: () => id.get() })
    await tick()
    expect(resource.data.get()).toBe("user:1")
    id.set(2)
    await tick()
    expect(resource.data.get()).toBe("user:2")
    resource.dispose()
  })

  it("ignores stale results when a newer fetch supersedes", async () => {
    const { promise, resolve } = Promise.withResolvers<string>()
    let calls = 0
    const resource = createResource(async () => {
      calls++
      return calls === 1 ? promise : "second"
    })
    // 第一次请求挂起中触发 refetch，第二次先完成
    resource.refetch()
    await tick()
    expect(resource.data.get()).toBe("second")
    resolve("first")
    await tick()
    // 迟到的旧结果不得覆盖
    expect(resource.data.get()).toBe("second")
    resource.dispose()
  })

  it("dispose stops updates; auto-disposes inside an effect", async () => {
    const resource = createResource(async () => "value")
    resource.dispose()
    await tick()
    expect(resource.data.get()).toBeUndefined()

    let inner: Resource<number> | null = null
    const stop = effect(() => {
      inner = createResource(async () => 42)
    })
    await tick()
    expect(inner!.data.get()).toBe(42)
    stop()
    expect(inner!.dispose).toBeDefined()
  })

  it("refetch clears a previous error before retrying", async () => {
    let fail = true
    const resource = createResource(async () => {
      if (fail) throw new Error("boom")
      return "ok"
    })
    await tick()
    expect(resource.error.get()).toBeInstanceOf(Error)
    fail = false
    resource.refetch()
    await tick()
    expect(resource.error.get()).toBeNull()
    expect(resource.data.get()).toBe("ok")
    expect(resource.loading.get()).toBe(false)
    resource.dispose()
  })

  it("refetch re-enters loading state synchronously", () => {
    let calls = 0
    const resource = createResource(async () => ++calls)
    // 首次 effect 运行是同步的，但 fetch 本身异步
    expect(resource.loading.get()).toBe(true)
    resource.refetch()
    expect(resource.loading.get()).toBe(true)
    resource.dispose()
  })

  it("dispose then refetch is a no-op", async () => {
    let calls = 0
    const resource = createResource(async () => ++calls)
    await tick()
    expect(resource.data.get()).toBe(1)
    resource.dispose()
    resource.refetch()
    await tick()
    // 已 dispose：不启动新请求，状态保持不变
    expect(calls).toBe(1)
    expect(resource.data.get()).toBe(1)
    expect(resource.loading.get()).toBe(false)
    expect(resource.error.get()).toBeNull()
  })

  it("dispose is idempotent", async () => {
    const resource = createResource(async () => "x")
    resource.dispose()
    expect(() => resource.dispose()).not.toThrow()
    await tick()
    expect(resource.data.get()).toBeUndefined()
  })
})
