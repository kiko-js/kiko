import { describe, it, expect } from "bun:test"

/**
 * 生产构建必须把 HMR 钩子（以及 `@kikojs/hmr` 的 import）完全 DCE 掉。
 * 浏览器侧代码必经 bundler 处理，bundler 会把 `process.env.NODE_ENV`
 * 静态替换为字面量；这里用 Bun.build 的 define 模拟生产 / 开发两种构建。
 */

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname

/** HMR 专属标记：生产产物里一个都不应出现。 */
const HMR_MARKERS = [
  "kiko:hmr",
  "takeSignal",
  "beginRenderScope",
  "endRenderScope",
  "installHmr",
  "moduleUpdated",
  "acceptHmrModule",
  "kiko:hmr:client",
  "EventSource",
]

async function bundle(nodeEnv: "production" | "development"): Promise<string> {
  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv) },
  })
  if (!result.success) throw new Error(result.logs.map(String).join("\n"))
  return result.outputs[0]!.text()
}

describe("production build", () => {
  it("strips HMR hooks from @kikojs/dom", async () => {
    const code = await bundle("production")
    for (const marker of HMR_MARKERS) {
      expect(code).not.toContain(marker)
    }
  })

  it("keeps HMR hooks in development", async () => {
    const code = await bundle("development")
    expect(code).toContain("kiko:hmr")
    expect(code).toContain("takeSignal")
  })
})
