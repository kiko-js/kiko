import { isAbsolute, relative } from "node:path"
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
  /**
   * 改写根目录；只有根内的文件才会被注入 HMR 胶水（默认 `process.cwd()`）。
   *
   * 必要性：monorepo 里 workspace 包常被 tsconfig `paths` 解析到
   * `packages` 下的 `src`。这些框架源码位于项目根之外，若也被改写，注入的
   * `@kikojs/dom/hmr` 会与框架内部模块（如 jsx-runtime ↔ dom/hmr）形成
   * 循环依赖，客户端直接崩溃。框架自身代码永不参与 HMR。
   *
   * 该值与 `createBunHmr({ cwd })` 应为同一目录，否则模块 id 与 watcher
   * 发布的 id 不一致。
   */
  root?: string
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

/**
 * 文件是否应参与 HMR 改写：必须在 `root` 内（项目源码），且不在
 * `node_modules` 里（第三方依赖按原样交给默认加载器）。
 */
export function isHmrTransformTarget(root: string, file: string): boolean {
  if (file.includes("node_modules")) return false
  const rel = relative(root, file)
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)
}

/** 转义正则元字符，用于把 root 拼进 onLoad 过滤正则。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function kikoHmr(options: KikoHmrOptions = {}): BunPlugin {
  const include = options.include ?? DEFAULT_HMR_INCLUDE
  const root = options.root ?? process.cwd()
  // 过滤正则直接限定在 root 内：根之外的模块（monorepo 里经 paths 解析到的
  // 框架源码）连 onLoad 都不会进入，完全走 Bun 默认加载器——避免框架源码被
  // 注入 `@kikojs/dom/hmr` 后形成循环依赖。
  const rootFilter = new RegExp(`^${escapeRegExp(root)}[\\\\/]`)
  return {
    name: "kiko-hmr",
    setup(build) {
      build.onLoad({ filter: rootFilter }, async (args: OnLoadArgs) => {
        if (!isHmrTransformTarget(root, args.path)) return undefined
        if (!include.test(args.path)) return undefined
        const source = await Bun.file(args.path).text()
        const moduleId = relative(root, args.path).replaceAll("\\", "/")
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
