import { createSignal } from "@kikojs/signal"
import type { Router } from "./types"

// activeRouter 是响应式信号：JSX children 先于 Router 组件体求值，Outlet /
// Link.activeClass / Navigate 在创建时拿不到 router，通过 effect 依赖本信号，
// Router 挂载（setActiveRouter）后自动补跑。模块级单例（同一时刻一个活动
// router）；多 Router 共存属于后续演进，当前保持与旧行为一致的全局语义。
const activeRouter = createSignal<Router | null>(null)

/** 设置当前活动的 router（由 Router 组件调用） */
export function setActiveRouter(router: Router | null): void {
  activeRouter.set(router)
}

/** 获取当前活动的 router；在 effect 内读取会建立响应式依赖 */
export function getActiveRouter(): Router | null {
  return activeRouter.get()
}

/** 获取当前活动的 router，若不存在则抛出 */
export function useRouter(): Router {
  const router = activeRouter.get()
  if (!router) {
    throw new Error("useRouter must be used inside a Router component")
  }
  return router
}
