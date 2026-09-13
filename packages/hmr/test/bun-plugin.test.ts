import { describe, it, expect } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BunPlugin } from "bun"
import { isHmrTransformTarget, kikoHmr } from "../src/bun/index"

/**
 * 插件只改写项目根内的源码。monorepo 里 workspace 包经 tsconfig `paths` 解析到
 * `packages` 下的 `src`，位于项目根之外；若被改写，注入的 `@kikojs/dom/hmr` 会与
 * 框架内部模块形成循环依赖（jsx-runtime ↔ dom/hmr），客户端直接崩溃。
 */

type OnLoad = (args: { path: string }) => Promise<{ contents: unknown } | undefined>

/** 用一个最小 build 对象捕获插件的 onLoad 回调，避免起真实打包。 */
function captureOnLoad(plugin: BunPlugin): OnLoad {
  let onLoad: OnLoad | null = null
  const build = {
    onLoad(_filter: RegExp, callback: OnLoad) {
      onLoad = callback
    },
  } as unknown as Parameters<BunPlugin["setup"]>[0]
  plugin.setup(build)
  expect(onLoad).not.toBeNull()
  return onLoad as unknown as OnLoad
}

describe("isHmrTransformTarget", () => {
  it("accepts project-root sources", () => {
    expect(isHmrTransformTarget("/app", "/app/src/App.tsx")).toBe(true)
  })

  it("rejects node_modules", () => {
    expect(isHmrTransformTarget("/app", "/app/node_modules/pkg/App.tsx")).toBe(false)
  })

  it("rejects sources outside the project root", () => {
    expect(isHmrTransformTarget("/app", "/repo/packages/dom/src/jsx-runtime.ts")).toBe(false)
  })

  it("rejects the root itself", () => {
    expect(isHmrTransformTarget("/app", "/app")).toBe(false)
  })
})

describe("kikoHmr plugin scope", () => {
  it("leaves framework sources outside the root untouched", async () => {
    const base = await mkdtemp(join(tmpdir(), "kiko-hmr-root-"))
    const root = join(base, "app")
    const framework = join(base, "packages", "dom", "src")
    await mkdir(root, { recursive: true })
    await mkdir(framework, { recursive: true })
    const file = join(framework, "jsx-runtime.ts")
    await writeFile(file, "export function Style() {\n  return null\n}\n")

    const onLoad = captureOnLoad(kikoHmr({ root }))
    const result = await onLoad({ path: file })
    // 返回 undefined = 交回默认加载器，插件不接管这些模块。
    expect(result).toBeUndefined()
  })

  it("rewrites project sources inside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "kiko-hmr-root-"))
    const file = join(root, "counter.tsx")
    await writeFile(file, "export function Counter() {\n  return <p />\n}\n")

    const onLoad = captureOnLoad(kikoHmr({ root }))
    const result = await onLoad({ path: file })
    expect(result).toBeDefined()
    expect(String(result?.contents)).toContain("__kiko_hmr.ref")
  })
})
