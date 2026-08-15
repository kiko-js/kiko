import { cleanupWatchers, trackCleanup } from "./jsx-runtime"
import { getSSRRuntime } from "./ssr-mode"

/**
 * 将 `node` 渲染到 `container`（如 `document.body`），返回留在原位置的锚点注释。
 *
 * Modal / Tooltip / Dropdown 等需要脱离文档流渲染；锚点随宿主树一起 dispose，
 * 届时移入 `container` 的节点会被移除并清理内部 watcher。
 *
 * 信号子节点先经 `jsx` 创建再整体移入
 * （如 `createPortal(jsx("div", { children: sig }), document.body)`），
 * 更新与清理机制保持不变。
 */
export function createPortal(node: Node, container: Element): Comment {
  if (getSSRRuntime()) {
    throw new Error("createPortal is client-only and cannot be used during SSR")
  }
  const anchor = document.createComment("portal")
  const nodes = node instanceof DocumentFragment ? Array.from(node.childNodes) : [node]
  for (const n of nodes) container.appendChild(n)
  trackCleanup(anchor, () => {
    for (const n of nodes) {
      cleanupWatchers(n)
      if (n.parentNode === container) container.removeChild(n)
    }
  })
  return anchor
}
