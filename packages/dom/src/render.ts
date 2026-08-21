import {
  applyScopeRoots,
  attachDelegationRoot,
  cleanupWatchers,
  detachDelegationRoot,
} from "./jsx-runtime"

export function render(root: Node, container: Element): () => void {
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
