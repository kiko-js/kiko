/**
 * SSR 服务端入口（`@kikojs/router/server`）。
 *
 * `withSSRRouter` 用 AsyncLocalStorage 把 router 绑定到当前请求的异步渲染
 * 作用域：并发渲染多条请求互不串扰，await 交错下依然按请求解析。注册
 * `setSSRRouterScope` 后，组件/hook 的 SSR 分支通过 `currentRouter()` 的
 * 请求作用域兜底拿到 router，不再需要（也不应再使用）模块级
 * `setActiveRouter` 预置——那个信号是模块级单例，只能串行使用。
 *
 * 客户端 bundle 永远不导入本入口：`node:async_hooks` 只存在于这个模块。
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { setSSRRouterScope } from "./context"
import type { Router } from "./types"

const scope = new AsyncLocalStorage<Router>()

setSSRRouterScope(() => scope.getStore() ?? null)

/**
 * 在 router 的请求作用域内执行 fn。fn 同步或异步（返回 Promise）均可；
 * AsyncLocalStorage 沿 await 链传播，渲染中途挂起再恢复仍归属本请求。
 * 嵌套调用时内层作用域覆盖外层。
 */
export function withSSRRouter<T>(router: Router, fn: () => T): T {
  return scope.run(router, fn)
}
