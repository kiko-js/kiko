/**
 * SSR 运行时注入桥（客户端与 SSR 唯一的公共点）。
 *
 * `jsx-runtime` / `flow` 通过 `getSSRRuntime()` 判断是否处于 SSR 模式：服务端
 * bundle 导入 `ssr.ts` 时自注册字符串运行时（永久生效，无开关翻转，天然并发
 * 安全）；客户端 bundle 从不导入 `ssr.ts`，桥保持 null，走 DOM 路径。
 *
 * 由此两个入口各自只携带自己的渲染侧：客户端不含任何 SSR 代码（可 tree-shake），
 * 服务端也无需 DOM 运行时分支；组件代码两端共用同一类型世界（`jsx` 恒为
 * `Node` 类型，SSR 的字符串是运行时事实，在边界处转换）。
 */

export interface SSRRuntime {
  /** SSR 模式的 jsx：组件返回 string | Promise<string>，元素返回序列化标记 */
  jsx(tag: unknown, props: Record<string, unknown> | null): unknown
  fragment(children: unknown): unknown
  style(props: Record<string, unknown>): unknown
  show(props: Record<string, unknown>): unknown
  for(props: Record<string, unknown>): unknown
  errorBoundary(props: Record<string, unknown>): unknown
  suspend(props: Record<string, unknown>): unknown
}

let runtime: SSRRuntime | null = null

/** 注册 SSR 运行时（由 ssr.ts 模块加载时自调用；客户端 bundle 不会触发） */
export function setSSRRuntime(r: SSRRuntime | null): void {
  runtime = r
}

/** 当前 SSR 运行时；null 表示客户端模式 */
export function getSSRRuntime(): SSRRuntime | null {
  return runtime
}
