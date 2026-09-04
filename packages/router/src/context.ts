import { createSignal } from "@kikojs/signal"
import type { Router } from "./types"

// activeRouter 是响应式信号：JSX children 先于 Router 组件体求值，Outlet /
// Link.activeClass / Navigate 在创建时拿不到 router，通过 effect 依赖本信号，
// Router 挂载（setActiveRouter）后自动补跑。
//
// 为支持多个 Router 共存（例如测试隔离、嵌套/并行路由树），这里改用栈：
// 每个 Router 挂载时压栈、卸载时出栈，dispose 一个 Router 只会恢复上一个
// 活动的 router，而不是把全局活动状态整个清空（旧的单例实现会误清他人）。
const activeRouter = createSignal<Router | null>(null)

// SSR 请求作用域读取器：由 `@kikojs/router/server` 注册（AsyncLocalStorage 实现）。
// 客户端 bundle 不导入 server 入口，getter 保持 null，零开销；服务端按请求隔离，
// 并发渲染互不串扰（activeRouter 信号是模块级单例，只适合客户端/测试）。
let getSSRScopeRouter: (() => Router | null) | null = null

/** 注册 SSR 请求作用域读取器（由 server 入口调用，传 null 撤销） */
export function setSSRRouterScope(get: (() => Router | null) | null): void {
  getSSRScopeRouter = get
}

// 内部栈：栈顶为当前活动 router；模块级单例语义退化为"栈顶"。
const activeStack: Router[] = []

/** 设置当前活动的 router（由 Router 组件调用） */
export function setActiveRouter(router: Router | null): void {
  if (router === null) {
    // 兼容测试/旧用法：清空活动状态（弹出栈顶，若存在）。
    if (activeStack.length > 0) {
      activeStack.pop()
    }
    activeRouter.set(activeStack.length > 0 ? activeStack[activeStack.length - 1]! : null)
    return
  }
  activeStack.push(router)
  activeRouter.set(router)
}

/**
 * 从栈中移除指定 router（由 Router 卸载时调用）。恢复为新的栈顶活动状态，
 * 或在没有活动 router 时置空——而不是误清别的 Router。
 */
export function clearActiveRouter(router: Router): void {
  const idx = activeStack.lastIndexOf(router)
  if (idx >= 0) {
    activeStack.splice(idx, 1)
  }
  activeRouter.set(activeStack.length > 0 ? activeStack[activeStack.length - 1]! : null)
}

/** 获取当前活动的 router；在 effect 内读取会建立响应式依赖 */
export function getActiveRouter(): Router | null {
  // 请求作用域优先：ALS 只在当前请求的异步链里可见，而 activeRouter 信号可能
  // 还留着上一个请求压栈的 router（服务端 setActiveRouter 的历史用法）。
  return getSSRScopeRouter?.() ?? activeRouter.get()
}

/** 获取当前活动的 router，若不存在则抛出 */
export function useRouter(): Router {
  // 走 getActiveRouter 而非直接读信号：SSR 下 hooks 依赖请求作用域解析
  const router = getActiveRouter()
  if (!router) {
    throw new Error("useRouter must be used inside a Router component")
  }
  return router
}
