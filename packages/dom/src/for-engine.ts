/**
 * For 的条目模型与重排引擎——flow.ts(客户端)与 hydrate.ts(水合更新)共用。
 *
 * 同一份条目模型(keyed:per-key state/accessor/idx;默认:条目身份 Map)与
 * 同一份最小移动重排,保证客户端渲染和水合后的更新走完全一致的协调路径,
 * 消除两处手写逻辑的漂移。水合的「初次采纳」(逐游标消费现有节点)是
 * hydrate 特有的,保留在 hydrate.ts,不在此模块。
 */
import { Signal } from "signal-polyfill"
import { applyScopeRoots, cleanupWatchers, toNodes } from "./jsx-runtime"
import { defaultForKey } from "./shared"

/** keyed 条目:children 通过 accessor 读取,state 是 per-key 的真值源 */
export interface ForKeyEntry<T> {
  nodes: Node[]
  state: Signal.State<T>
  accessor: Signal.Computed<T>
  idx: Signal.State<number>
}

export interface ForCoreOptions<T> {
  /** 分支锚点:重排以 marker 为插入基准 */
  marker: Node
  /** children 渲染函数(keyed 传 accessor、默认传值,签名在此保持宽松) */
  children: (item: T | (() => T), index: () => number) => unknown
  /**
   * 节点物化钩子:客户端 toNodes;水合传 hydrateValue(逐游标消费现有节点)。
   * adopt* 方法走它,更新方法始终走 toNodes(存活节点复用,只物化新条目)。
   */
  render?: (value: unknown) => Node[]
}

export interface ForCore<T> {
  /** 当前挂在 marker 之后的节点(宿主 cleanup 时逐个拆除) */
  current: Node[]
  /** keyed 条目表(key → entry) */
  entries: Map<unknown, ForKeyEntry<T>>
  /** 默认身份条目表(key → 节点数组;水合采纳阶段直接写入) */
  plain: Map<unknown, Node[]>
  /** keyed 更新:存活 key 更新 state/idx 并复用节点,dropped 拆除 */
  keyed(list: readonly T[], getKey: (item: T, index: number) => unknown): void
  /** 默认身份 keying:key = 条目本身(SameValueZero),重复条目回退整表重建 */
  identity(list: readonly T[]): void
  /** 整表重建:children 全量重跑,节点全换 */
  full(list: readonly T[]): void
  /** 水合初次采纳(keyed):逐项建条目 + 物化钩子消费现有节点,不做重排 */
  adoptKeyed(list: readonly T[], getKey: (item: T, index: number) => unknown): void
  /** 水合初次采纳(默认身份):游标必须逐项消费,重复身份只登记首个条目 */
  adoptIdentity(list: readonly T[]): void
  /** 拆除全部节点并清空条目状态(宿主 cleanup) */
  dispose(): void
}

/** keyed 条目工厂:keyed() 新建与水合采纳共用同一构造(条目模型单一来源) */
function createKeyedEntry<T>(item: T, index: number): ForKeyEntry<T> {
  const state = new Signal.State<T>(item)
  const accessor = new Signal.Computed<T>(() => state.get())
  return { nodes: [], state, accessor, idx: new Signal.State(index) }
}

/**
 * 最小移动重排(SolidJS-style):先拆除 dropped 节点,移除不再存活的节点,
 * 存活节点按 `next` 顺序以单次后向插入锚定到 marker。
 */
function reconcileForList(
  parent: Node | null,
  marker: Node,
  currentNodes: Node[],
  next: Node[],
  droppedNodes: Node[][],
): Node[] {
  for (const nodes of droppedNodes) {
    for (const n of nodes) cleanupWatchers(n)
  }
  if (!parent) return next
  const keep = new Set(next)
  for (const n of currentNodes) {
    if (!keep.has(n)) parent.removeChild(n)
  }
  let ref: Node = marker
  for (let i = next.length - 1; i >= 0; i--) {
    const node = next[i] as Node
    if (node.nextSibling !== ref) parent.insertBefore(node, ref)
    applyScopeRoots(node, parent)
    ref = node
  }
  return next
}

export function createForCore<T>(opts: ForCoreOptions<T>): ForCore<T> {
  const { marker, children } = opts
  const renderNode = opts.render ?? toNodes
  const core: ForCore<T> = {
    current: [],
    entries: new Map(),
    plain: new Map(),

    keyed(list, getKey) {
      const parent = marker.parentNode
      const next: Node[] = []
      const nextEntries = new Map<unknown, ForKeyEntry<T>>()
      const childFn = children as (item: () => T, index: () => number) => unknown
      for (let i = 0; i < list.length; i++) {
        const item = list[i] as T
        const key = getKey(item, i)
        const existing = core.entries.get(key)
        if (existing) {
          existing.state.set(item)
          existing.idx.set(i)
          core.entries.delete(key)
          nextEntries.set(key, existing)
          next.push(...existing.nodes)
        } else {
          const entry = createKeyedEntry(item, i)
          entry.nodes = toNodes(
            childFn(
              () => entry.accessor.get(),
              () => entry.idx.get(),
            ),
          )
          nextEntries.set(key, entry)
          next.push(...entry.nodes)
        }
      }
      const dropped: Node[][] = []
      for (const entry of core.entries.values()) dropped.push(entry.nodes)
      core.current = reconcileForList(parent, marker, core.current, next, dropped)
      core.entries = nextEntries
      core.plain = new Map()
    },

    identity(list) {
      const parent = marker.parentNode
      const next: Node[] = []
      const nextPlain = new Map<unknown, Node[]>()
      const childFn = children as (item: T, index: () => number) => unknown
      let fallback = false
      const seen = new Set<unknown>()
      for (let i = 0; i < list.length; i++) {
        const item = list[i] as T
        const key = defaultForKey(item)
        if (seen.has(key)) {
          fallback = true
          break
        }
        seen.add(key)
        const existing = core.plain.get(key)
        if (existing) {
          nextPlain.set(key, existing)
          next.push(...existing)
        } else {
          const nodes = toNodes(childFn(item, () => i))
          nextPlain.set(key, nodes)
          next.push(...nodes)
        }
      }
      if (fallback) {
        core.full(list)
        return
      }
      const dropped: Node[][] = []
      for (const [key, nodes] of core.plain) {
        if (!nextPlain.has(key)) dropped.push(nodes)
      }
      core.current = reconcileForList(parent, marker, core.current, next, dropped)
      core.plain = nextPlain
      core.entries = new Map()
    },

    full(list) {
      const next: Node[] = []
      const childFn = children as (item: T, index: () => number) => unknown
      for (let i = 0; i < list.length; i++) {
        next.push(...toNodes(childFn(list[i] as T, () => i)))
      }
      core.current = reconcileForList(marker.parentNode, marker, core.current, next, [core.current])
      core.entries = new Map()
      core.plain = new Map()
    },

    adoptKeyed(list, getKey) {
      const childFn = children as (item: () => T, index: () => number) => unknown
      const out: Node[] = []
      for (let i = 0; i < list.length; i++) {
        const item = list[i] as T
        const entry = createKeyedEntry(item, i)
        entry.nodes = renderNode(
          childFn(
            () => entry.accessor.get(),
            () => entry.idx.get(),
          ),
        )
        core.entries.set(getKey(item, i), entry)
        out.push(...entry.nodes)
      }
      core.current = out
    },

    adoptIdentity(list) {
      const childFn = children as (item: T, index: () => number) => unknown
      const out: Node[] = []
      for (let i = 0; i < list.length; i++) {
        const item = list[i] as T
        const nodes = renderNode(childFn(item, () => i))
        // 重复身份只登记首个条目(游标必须逐项消费,无法回退整表重建);
        // 后续更新遇重复身份会回退全量重建
        if (!core.plain.has(defaultForKey(item))) core.plain.set(defaultForKey(item), nodes)
        out.push(...nodes)
      }
      core.current = out
    },

    dispose() {
      for (const n of core.current) cleanupWatchers(n)
      core.current = []
      core.entries = new Map()
      core.plain = new Map()
    },
  }
  return core
}
