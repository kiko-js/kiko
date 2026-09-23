/**
 * 分支保留簿记——Show / Suspend / ErrorBoundary 的客户端与水合路径共用。
 *
 * 这三个控制流组件都有同一组需求:以 marker 为锚换入换出分支节点;静态分支
 * (fallback 缓存、Show 的静态 children)换出时保留 watcher(同一批节点会再次
 * 换入,cleanupWatchers 会令重挂载后的绑定"死亡");宿主清理时既要清当前可见
 * 分支,也要清隐藏保留分支(其 watcher 一直存活)。把这些簿记收敛为一处,
 * 避免六个调用点各自漂移。
 */
import { cleanupWatchers, swapBranch, trackSnapshot, untrackSnapshot } from "./jsx-runtime"

export interface BranchManager {
  /** 当前可见分支节点(构造返回值 / 初次采纳直接设置) */
  readonly current: Node[]
  /** 水合初次采纳:不经 DOM 交换直接设定初始节点(已在文档序中) */
  adopt(nodes: Node[]): void
  /** 换入下一分支;retainOld=true 时旧分支只移除不清理,由 cleanup 兜底 */
  swap(next: Node[], retainOld: boolean): void
  /** 宿主 cleanup:清 current 与隐藏保留分支的 watcher/cleanup */
  cleanup(): void
}

export function createBranchManager(marker: Node): BranchManager {
  let current: Node[] = []
  let retainedAway: Node[] | null = null
  return {
    get current() {
      return current
    },
    adopt(nodes) {
      // 水合采纳的数组同样进注册表:嵌套控制流后续换出时才能被补丁
      trackSnapshot(nodes)
      current = nodes
    },
    swap(next, retainOld) {
      if (retainOld) retainedAway = current
      else retainedAway = null
      // swapBranch 内部 track(next) 并按 old 反查补丁所有宿主快照
      current = swapBranch(marker, current, next, retainOld)
    },
    cleanup() {
      for (const n of current) cleanupWatchers(n)
      if (retainedAway) for (const n of retainedAway) cleanupWatchers(n)
      untrackSnapshot(current)
      if (retainedAway) untrackSnapshot(retainedAway)
      current = []
      retainedAway = null
    },
  }
}
