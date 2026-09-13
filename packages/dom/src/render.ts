import { isLazy, realizeLazy } from "./lazy-node"
import {
  applyScopeRoots,
  attachDelegationRoot,
  cleanupWatchers,
  detachDelegationRoot,
} from "./jsx-runtime"
import { beginRenderScope, endRenderScope } from "@kikojs/hmr"

export function render(rootNode: Node, container: Element): () => void {
  // HMR：物化前声明渲染容器，让实例认领只作用于同一容器内的旧实例
  // （入口模块重求值重跑 render 时复用组件状态；全新 render 不抢别的树的实例）。
  //
  // 用 bundler 可静态替换的 `process.env.NODE_ENV` 守卫：生产构建下
  // begin/endRenderScope 连同 `@kikojs/hmr` 的 import 一并被 DCE，
  // 生产包不含 HMR 代码（详见 signal.ts 的同款守卫）。
  const dev = process.env.NODE_ENV !== "production"
  if (dev) beginRenderScope(container)
  let root: Node
  try {
    root = isLazy(rootNode) ? (realizeLazy(rootNode) as Node) : rootNode
  } finally {
    if (dev) endRenderScope()
  }
  // If the container already hosts a kiko tree, tear down its watchers and
  // cleanups before overwriting the DOM — otherwise `innerHTML = ""` would
  // orphan watchers that still reference the old (now-detached) nodes.
  cleanupWatchers(container)
  container.innerHTML = ""
  applyScopeRoots(root, container)
  container.appendChild(root)
  attachDelegationRoot(container)

  return () => {
    detachDelegationRoot(container)
    cleanupWatchers(container)
    container.innerHTML = ""
  }
}
