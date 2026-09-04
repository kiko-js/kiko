import { createSignal } from "@kikojs/signal"
import type { Router } from "./types"

// Router 的隐式注入机制（不依赖 context），三条解析路径按序生效：
//
// 1) 渲染帧：Router/Outlet 渲染子树期间压帧，帧内创建的组件精确捕获——
//    嵌套/并存 Router 各自作用域，互不串扰。栈仅在同步渲染 walk 期间存在，
//    无需挂载/卸载管理。
// 2) activeRouter 信号：词法 children 已由惰性物化推迟到 Router 帧内求值
//    （帧精确捕获）；但 lazy/async 路由组件在帧弹出后的微任务里才执行，拿
//    不到帧——effect/computed 借助信号兜底补绑，并做一次性绑定（首个非空
//    router 永久生效），避免其后挂载的其他 Router 串扰已绑定的组件。
// 3) SSR 请求作用域：`@kikojs/router/server` 的 AsyncLocalStorage 兜底，按
//    请求隔离。同步帧栈在 ssr-stream 的异步 chunkify 下会跨请求串扰，服务端
//    只信 ALS；客户端 bundle 不导入 server 入口，getter 保持 null，零开销。

const activeRouter = createSignal<Router | null>(null)

// 内部栈：栈顶为当前活动 router；模块级单例语义退化为"栈顶"。
const activeStack: Router[] = []

/** 设置当前活动的 router（由 Router 组件挂载时调用） */
export function setActiveRouter(router: Router | null): void {
  if (router === null) {
    // 兼容测试/旧用法：弹出栈顶，恢复上一个活动 router。
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

// SSR 请求作用域读取器：由 `@kikojs/router/server` 注册（AsyncLocalStorage 实现）。
let getSSRScopeRouter: (() => Router | null) | null = null

/** 注册 SSR 请求作用域读取器（由 server 入口调用，传 null 撤销） */
export function setSSRRouterScope(get: (() => Router | null) | null): void {
  getSSRScopeRouter = get
}

export interface RouterFrame {
  router: Router
  /** 帧对应的 Outlet 深度（根帧 0，子帧为父深度 + 1） */
  depth: number
}

const frames: RouterFrame[] = []

/** 压入渲染帧（同步渲染 walk 期间有效） */
export function pushFrame(frame: RouterFrame): void {
  frames.push(frame)
}

/** 弹出渲染帧（与 pushFrame 严格配对，放在 finally 中） */
export function popFrame(): void {
  frames.pop()
}

/** 在帧内执行同步渲染代码（Router 的根帧与测试脚手架用） */
export function withFrame<T>(frame: RouterFrame, fn: () => T): T {
  pushFrame(frame)
  try {
    return fn()
  } finally {
    popFrame()
  }
}

/** 当前栈顶帧（Outlet 创建时读取层级/路由） */
export function currentFrame(): RouterFrame | undefined {
  return frames[frames.length - 1]
}

/**
 * 解析当前 router：渲染帧 → SSR 请求作用域（ALS）→ activeRouter 信号。
 * 在 effect/computed 内调用会建立信号依赖（帧/ALS 非空时不读信号）。
 * 组件应配合一次性绑定使用：首个非空结果永久生效。
 */
export function currentRouter(): Router | null {
  return currentFrame()?.router ?? getSSRScopeRouter?.() ?? activeRouter.get()
}

/** 兼容别名：信号语义的历史名称（effect 内读取会建立响应式依赖） */
export function getActiveRouter(): Router | null {
  return currentRouter()
}

/** 获取当前 router，若不存在则抛出（hooks 在 Router 渲染范围内调用） */
export function useRouter(): Router {
  const router = currentRouter()
  if (!router) {
    throw new Error("useRouter must be used inside a Router component")
  }
  return router
}

/**
 * 一次性绑定助手：组件/effect 持有一个 `{ router }` 槽位，每个响应式周期
 * 调用 `bindRouter(slot)`——首个非空 router 永久生效，其后挂载的其他 Router
 * 不会串扰。kiko 组件只跑一次，绑定的 router 生命周期即组件生命周期。
 */
export function bindRouter(slot: { router: Router | null }): Router | null {
  if (slot.router) return slot.router
  slot.router = currentRouter()
  return slot.router
}
