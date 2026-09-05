/**
 * SSR 请求作用域(node 专用,`@kikojs/dom/server` 安装)。
 *
 * SSR 运行时与信号捕获/恢复状态是进程级槽位;并发渲染(HTTP 服务每请求
 * 一段)必须各自包进 `withSSRScope`,状态才按请求隔离——否则请求 A 的
 * 信号值会串进请求 B 的序列化载荷,流的运行时换入也会污染并发渲染。
 * 串行使用无需包裹,行为同旧的全局槽位。
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { getSSRRuntime, setSSRRuntimeScope } from "./ssr-mode"
import type { SSRRuntime } from "./ssr-mode"
import { freshSerializeState, setSerializeStateScope } from "./signal-serialize"
import type { SerializeSlot } from "./signal-serialize"

interface RequestScope {
  runtime: SSRRuntime | null
  serialize: SerializeSlot
}

const als = new AsyncLocalStorage<RequestScope>()

setSSRRuntimeScope(() => als.getStore())
setSerializeStateScope(() => als.getStore()?.serialize)

/**
 * 请求级 SSR 作用域:`fn` 内(含其 await 之后)的运行时读写与信号
 * 捕获/恢复都落在本次请求的槽位上。可嵌套(内层继承外层的运行时与
 * 捕获态)。并发渲染(HTTP 服务每请求一段)必须各自包进本作用域。
 *
 * ```ts
 * import { withSSRScope, renderToFragment, startSignalCapture, serializeSignals } from "@kikojs/dom/server"
 *
 * app.get("/", async () => {
 *   return withSSRScope(async () => {
 *     startSignalCapture()
 *     const html = await renderToFragment(() => <App />)
 *     const signals = serializeSignals()
 *     return page(html, signals)
 *   })
 * })
 * ```
 */
export function withSSRScope<T>(fn: () => T): T {
  const outer = als.getStore()
  const store: RequestScope = {
    // 顶层作用域读常驻注册(此时无作用域,兜底槽即 server.ts 注册的运行时);
    // 嵌套作用域继承外层当前值(如流渲染中途的换入)
    runtime: outer ? outer.runtime : getSSRRuntime(),
    serialize: outer?.serialize ?? freshSerializeState(),
  }
  return als.run(store, fn)
}
