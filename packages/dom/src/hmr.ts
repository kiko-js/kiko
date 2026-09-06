import {
  installHmr as installRuntime,
  getHmrRegistry,
  KIKO_HMR,
  type HmrDomAdapters,
  type KikoHmrRegistry,
} from "@kikojs/hmr"
import { isLazy, realizeLazy, KikoLazy } from "./lazy-node"
import { reportError } from "./signal"
import { applyScopeRoots, cleanupWatchers, toNodes } from "./jsx-runtime"

/**
 * `@kikojs/dom/hmr` —— DOM 宿主接线层：把 dom 内部原语注入 `@kikojs/hmr`
 * 运行时并安装全局注册表。Bun 插件胶水（`runtimeModule` 默认值）导入此入口。
 */

const domAdapters: HmrDomAdapters = {
  resolveNodes(out) {
    // Fragment 记录其子节点（采纳后身份不变）。
    const v = isLazy(out) ? realizeLazy(out) : out
    if (v instanceof DocumentFragment) return Array.from(v.childNodes)
    return toNodes(v)
  },
  cleanup(node) {
    cleanupWatchers(node)
  },
  adopt(node, parent) {
    applyScopeRoots(node, parent)
  },
  report(err) {
    reportError(err)
  },
  defer(run) {
    return new KikoLazy(run)
  },
}

/** 安装（幂等）并返回全局唯一的 HMR 注册表。 */
export function installHmr(): KikoHmrRegistry {
  return installRuntime(domAdapters)
}

export { getHmrRegistry, KIKO_HMR, type HmrDomAdapters, type KikoHmrRegistry }
