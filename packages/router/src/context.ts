import type { Router } from "./types"

let activeRouter: Router | null = null

/** 设置当前活动的 router（由 Router 组件调用） */
export function setActiveRouter(router: Router | null): void {
  activeRouter = router
}

/** 获取当前活动的 router */
export function getActiveRouter(): Router | null {
  return activeRouter
}

/** 获取当前活动的 router，若不存在则抛出 */
export function useRouter(): Router {
  if (!activeRouter) {
    throw new Error("useRouter must be used inside a Router component")
  }
  return activeRouter
}
