import { isLazy, realizeLazy } from "./lazy-node"
import {
  applyScopeRoots,
  attachDelegationRoot,
  cleanupWatchers,
  detachDelegationRoot,
} from "./jsx-runtime"
import { beginRenderScope, endRenderScope } from "./hmr"

export function render(rootNode: Node, container: Element): () => void {
  // HMR：物化前声明渲染容器，让实例认领只作用于同一容器内的旧实例
  // （入口模块重求值重跑 render 时复用组件状态；全新 render 不抢别的树的实例）
  beginRenderScope(container)
  let root: Node
  try {
    root = isLazy(rootNode) ? (realizeLazy(rootNode) as Node) : rootNode
  } finally {
    endRenderScope()
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
