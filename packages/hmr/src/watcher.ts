import { watch as watchFs, type FSWatcher } from "node:fs"
import { relative, resolve } from "node:path"

/**
 * 通用文件监听 / 模块 id 规范化（与接入方式无关）。
 *
 * 接入层（`@kikojs/hmr/bun`、`@kikojs/hmr/node`）用同一套规则把磁盘变化
 * 映射成不透明模块 id，保证插件改写、watcher 发布、客户端重新导入三者
 * 针对同一个 id。核心 Hub 不关心 id 是不是路径。
 */

/** 默认参与 HMR 的文件。 */
export const DEFAULT_HMR_INCLUDE = /\.(tsx|jsx|ts)$/

/** 文件绝对路径 → 相对 `cwd` 的模块 id（正斜杠，跨平台一致）。 */
export function toModuleId(cwd: string, file: string): string {
  return relative(cwd, file).replaceAll("\\", "/")
}

/** `watch` 选项 → 监听根目录列表（`false` → 不监听）。 */
export function resolveWatchRoots(watch: boolean | string | string[], cwd: string): string[] {
  if (watch === true) return [cwd]
  if (watch === false) return []
  return Array.isArray(watch) ? watch : [watch]
}

export interface PathWatcherOptions {
  /** 监听根目录（文件或目录；目录递归监听）。 */
  roots: string[]
  /** 模块 id 规范化基准。 */
  cwd: string
  /** 参与 HMR 的文件；默认 `DEFAULT_HMR_INCLUDE`。 */
  include?: RegExp
  /** 变化合并窗口（毫秒）；默认 30。 */
  debounceMs?: number
  /** 一批变化收敛后回调（模块 id 列表）。 */
  onChange(modules: string[]): void
  /** watcher 错误回调。 */
  onError?(error: unknown): void
}

/**
 * 递归监听多个根目录，去抖后按批回调变化的模块 id。返回停止函数。
 * 用 `fs.watch({ recursive: true })`（Bun / 现代 Node 均支持）。
 */
export function createPathWatcher(options: PathWatcherOptions): () => void {
  const include = options.include ?? DEFAULT_HMR_INCLUDE
  const debounceMs = options.debounceMs ?? 30
  const watchers: FSWatcher[] = []
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    timer = null
    const modules = [...pending]
    pending.clear()
    if (modules.length > 0) options.onChange(modules)
  }

  const enqueue = (file: string): void => {
    if (file.includes("node_modules")) return
    if (!include.test(file)) return
    pending.add(toModuleId(options.cwd, file))
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  for (const root of options.roots) {
    try {
      const watcher = watchFs(root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        enqueue(resolve(root, filename.toString()))
      })
      watcher.on("error", error => options.onError?.(error))
      watchers.push(watcher)
    } catch (error) {
      options.onError?.(error)
    }
  }

  return () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pending.clear()
    for (const watcher of watchers) watcher.close()
    watchers.length = 0
  }
}
