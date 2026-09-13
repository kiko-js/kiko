import { relative } from "node:path"
import type { BunPlugin, OnLoadArgs } from "bun"
import { transformForHmr } from "../transform"
import { DEFAULT_HMR_INCLUDE } from "../watcher"

/**
 * `@kikojs/hmr/bun` — kiko 的 Bun 接入入口（插件 + `Bun.serve` 适配器）。
 * 通用代码（协议 / Hub / 客户端 / 改写 / watcher）在 `@kikojs/hmr`。
 *
 * bunfig.toml（Bun 全栈 dev server 的打包插件走 `[serve.static]`）：
 *
 * ```toml
 * [serve.static]
 * plugins = ["@kikojs/hmr/bun"]
 * ```
 *
 * 配合 `Bun.serve({ development: { hmr: true } })` 使用；`import.meta.hot`
 * 粘合代码在生产构建中会被 Bun 自动消除。
 *
 * 模块同时会连到独立的 HMR 端点（默认 `/hmr`，见 `createBunHmr`）。Bun
 * 自带 HMR 时由 `import.meta.hot.accept` 负责替换；没有 `import.meta.hot`
 * 的宿主则由端点驱动 `moduleUpdated`（必要时按模块 URL 重新导入）。
 */

export { createBunHmr, toModuleId, type BunHmr, type BunHmrOptions } from "./serve"
export { transformForHmr, type HmrTransformOptions, type HmrTransformResult } from "../transform"

export interface KikoHmrOptions {
  /** 需要 HMR 改写的文件（默认 .ts/.tsx/.jsx）。 */
  include?: RegExp
  /** HMR 运行时模块（默认 `@kikojs/dom/hmr`）。 */
  runtimeModule?: string
  /** 端点客户端模块（默认 `@kikojs/hmr/client`）。 */
  clientModule?: string
}

type Loader = "ts" | "tsx" | "jsx"

function loaderOf(path: string): Loader {
  if (path.endsWith(".tsx")) return "tsx"
  if (path.endsWith(".jsx")) return "jsx"
  return "ts"
}

export function kikoHmr(options: KikoHmrOptions = {}): BunPlugin {
  const include = options.include ?? DEFAULT_HMR_INCLUDE
  return {
    name: "kiko-hmr",
    setup(build) {
      build.onLoad({ filter: include }, async (args: OnLoadArgs) => {
        const source = await Bun.file(args.path).text()
        // node_modules 里的第三方代码不参与 HMR，按原样交给默认加载器
        if (args.path.includes("node_modules")) {
          return { contents: source, loader: loaderOf(args.path) }
        }
        const moduleId = relative(process.cwd(), args.path).replaceAll("\\", "/")
        const result = transformForHmr(args.path, source, moduleId, {
          runtimeModule: options.runtimeModule,
          clientModule: options.clientModule,
          bundler: "bun",
        })
        return { contents: result ? result.code : source, loader: loaderOf(args.path) }
      })
    },
  }
}

/** bunfig.toml `plugins` 需要现成的插件对象：默认导出即零配置实例。 */
const kikoHmrPlugin: BunPlugin = kikoHmr()
export default kikoHmrPlugin
