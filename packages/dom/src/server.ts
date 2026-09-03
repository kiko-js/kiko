/**
 * SSR 入口（`@kikojs/dom/server`）。
 *
 * 导入本模块即注册 SSR 字符串运行时（`ssr.ts` 自注册）；组件代码仍从
 * `@kikojs/dom` 导入 `jsx` / 控制流组件，运行时路由会把它们切到字符串模式。
 * 客户端 bundle 不导入本模块，SSR 代码可被 tree-shake 剔除。
 */
import { setSSRRuntime } from "./ssr-mode"
import { ssrRuntime } from "./ssr"

// 显式注册 SSR 运行时（区别于 ssr.ts 自注册：注册是可见副作用，不随模块导入隐式发生）
setSSRRuntime(ssrRuntime)

export { renderToFragment } from "./ssr"
export { renderToStream } from "./ssr-stream"
export {
  startSignalCapture,
  stopSignalCapture,
  serializeSignals,
  restoreSignals,
  stopSignalRestore,
} from "./signal-serialize"
export { createSignal, isSignal, createWatcher } from "./signal"
export { lazy } from "./lazy"
export type { WatchableSignal, Watcher } from "./signal"
export type { Component, AsyncComponent, Props, StyleProps } from "./jsx-runtime"
export type { JSX } from "./jsx-types"
