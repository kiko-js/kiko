import { Signal } from "signal-polyfill"
import { isLazy, realizeLazy, KikoLazy } from "./lazy-node"
import { reportError } from "./signal"
import {
  applyScopeRoots,
  cleanupWatchers,
  toNodes,
  type Component,
  type Props,
} from "./jsx-runtime"
import { isPromiseLike } from "./shared"
import { KIKO_HMR, type KikoHmrRegistry } from "./hmr-contract"

/**
 * HMR 运行时（`@kikojs/dom/hmr`）。与 `@kikojs/bun` 插件配合，实现
 * React Fast Refresh 语义的热替换：
 *
 * - 插件把组件声明改写为 `installHmr().ref(moduleId, name, impl)` 的稳定包装，
 *   并注入 `beginModule` / `endModule` 与 `import.meta.hot` 粘合代码；
 * - 包装函数每次被 JSX 消费（realize）时记录一个实例：props、输出节点、
 *   组件体内创建的信号快照；
 * - 模块热更新后，实例用新实现 + 旧 props 重跑，新输出在原位换入，旧子树
 *   清理 watcher 后移除；
 * - 组件内部信号按「创建顺序 + 类型指纹」恢复旧值（与 hooks 顺序启发式
 *   同源的约定）；模块级信号按「模块 + 创建序」直接复用旧信号对象，身份
 *   与值都保留。
 *
 * 注册表通过 `globalThis[Symbol.for("kiko:hmr")]` 暴露为单例——`createSignal`
 * 的 HMR 钩子与插件注入代码不依赖具体某一份 @kikojs/dom 副本。
 */

interface SignalSlot {
  kind: string
  signal: Signal.State<unknown>
}

interface Instance {
  moduleId: string
  name: string
  props: Props
  nodes: Node[]
  /** 本次实例体内创建的信号（按创建序），重跑时按序恢复值。 */
  signals: SignalSlot[]
}

interface KeyEntry {
  impl: Component
  /** 本轮模块求值是否重新注册过；未注册说明组件已被删除。 */
  live: boolean
  instances: Instance[]
}

interface ModuleEntry {
  keys: Map<string, KeyEntry>
  fresh: boolean
  pending: boolean
}

interface InstanceScope {
  prev: SignalSlot[] | null
  index: number
  created: SignalSlot[]
}

interface ModuleScope {
  moduleId: string
  index: number
}

const modules = new Map<string, ModuleEntry>()
const moduleSignals = new Map<string, Signal.State<unknown>>()
let instanceScope: InstanceScope | null = null
let moduleScope: ModuleScope | null = null
const scheduled = new Set<string>()

function kindOf(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

function moduleEntry(moduleId: string): ModuleEntry {
  let m = modules.get(moduleId)
  if (!m) {
    m = { keys: new Map(), fresh: false, pending: false }
    modules.set(moduleId, m)
  }
  return m
}

/** 组件输出 → 顶层节点列表。Fragment 记录其子节点（采纳后身份不变）。 */
function recordNodes(out: unknown): Node[] {
  const v = isLazy(out) ? realizeLazy(out) : out
  if (v instanceof DocumentFragment) return Array.from(v.childNodes)
  return toNodes(v)
}

function runUnderInstance(inst: Instance, run: () => unknown): unknown {
  const scope: InstanceScope = { prev: inst.signals, index: 0, created: [] }
  const outer = instanceScope
  instanceScope = scope
  try {
    return run()
  } finally {
    instanceScope = outer
    inst.signals = scope.created
  }
}

/** 本轮更新批次内已被父级 remount 认领的实例：跳过独立 remount。 */
const claimed = new Set<Instance>()
let updating = false
/** render() 物化期间声明的容器：认领只作用于同一容器内的旧实例。 */
let renderContainer: Element | null = null
/** performUpdate 驱动的 remount 深度：此上下文中的 realize 允许认领。 */
let remountDepth = 0

/**
 * render() 在物化根节点前调用（见 render.ts）。入口模块重求值会重跑
 * render——实例认领必须只作用于同一容器内的旧实例，否则一次全新的
 * render 会把别的渲染树（或测试里残留的旧容器）中的实例抢走。
 */
export function beginRenderScope(container: Element): void {
  renderContainer = container
}

export function endRenderScope(): void {
  renderContainer = null
}

/**
 * 父级 remount 会用新 JSX 重新 realize 子组件——若创建新实例，子组件内部
 * 信号（useState 等价物）就丢了。更新批次内改为按创建序认领同 key 的现存
 * 实例：沿用其记录（信号快照恢复旧值），用新 props 重跑。与 hooks 顺序
 * 启发式同源的约定：同一组件槽位的创建顺序须稳定。
 *
 * 可认领条件：
 * - 节点仍连接在文档中（初始渲染时同 key 前一个槽位尚未挂载，不能被抢）；
 * - 处于 render 作用域时，必须位于同一容器内（全新 render 不抢其他树）。
 */
function claimInstance(mod: ModuleEntry, name: string): Instance | null {
  for (const inst of mod.keys.get(name)?.instances ?? []) {
    if (claimed.has(inst)) continue
    if (!inst.nodes.some(n => n.isConnected)) continue
    // 认领上下文门槛：render 作用域内（同容器）或 performUpdate 驱动的
    // remount。jsx() 构造期的急切物化两者皆非——那时无法知道新树的去处，
    // 认领只会误伤别的渲染树的实例。
    if (renderContainer === null && remountDepth === 0) continue
    if (renderContainer && !inst.nodes.some(n => renderContainer?.contains(n))) continue
    claimed.add(inst)
    return inst
  }
  return null
}

function realize(
  mod: ModuleEntry,
  moduleId: string,
  name: string,
  impl: Component,
  props: Props,
): unknown {
  if (updating) {
    const claimedInst = claimInstance(mod, name)
    if (claimedInst) {
      claimedInst.props = props
      // 必须用注册表里的当前实现：包装闭包捕获的是其求值时的旧实现
      const current = mod.keys.get(name)?.impl ?? impl
      const out = runUnderInstance(claimedInst, () => current(props))
      if (isPromiseLike(out)) return out
      claimedInst.nodes = recordNodes(out)
      return out
    }
  }
  const inst: Instance = { moduleId, name, props, nodes: [], signals: [] }
  const out = runUnderInstance(inst, () => impl(props))
  if (isPromiseLike(out)) return out
  inst.nodes = recordNodes(out)
  mod.keys.get(name)?.instances.push(inst)
  return out
}

/**
 * 原位换入新输出。先把仍挂在旧父节点上的旧节点整体摘下（不清理——被复用的
 * 节点稍后会随新树重新插回），再按序插入新节点，最后只对被淘汰的旧节点做
 * watcher/cleanup 清理。被复用节点（props.children）经由 realizeMemo 天然
 * 身份不变，摘下再插回即可保持状态。
 */
function remountInstance(mod: ModuleEntry, inst: Instance): void {
  const entry = mod.keys.get(inst.name)
  if (!entry) return
  let out: unknown
  remountDepth++
  try {
    out = runUnderInstance(inst, () => entry.impl(inst.props))
  } catch (err) {
    reportError(err)
    return
  } finally {
    remountDepth--
  }
  if (isPromiseLike(out)) return
  let next: Node[]
  try {
    next = recordNodes(out)
  } catch (err) {
    reportError(err)
    return
  }
  const old = inst.nodes
  const last = old[old.length - 1] as Node | undefined
  const parent = last ? last.parentNode : undefined
  if (!parent) {
    // 旧节点已整体脱离文档（如被保留的隐藏分支）：无法原位换入，丢弃本次
    // 渲染，保留旧节点身份（重挂载后显示旧 UI 的已知局限）。
    for (const n of next) cleanupWatchers(n)
    return
  }
  const nextSet = new Set(next)
  const endRef = last?.nextSibling ?? null
  for (const n of old) {
    if (n.parentNode === parent) parent.removeChild(n)
  }
  for (const n of next) {
    applyScopeRoots(n, parent)
    parent.insertBefore(n, endRef)
  }
  for (const n of old) {
    if (nextSet.has(n)) continue
    n.parentNode?.removeChild(n)
    cleanupWatchers(n)
  }
  inst.nodes = next
}

function unmountInstance(inst: Instance): void {
  for (const n of inst.nodes) {
    n.parentNode?.removeChild(n)
    cleanupWatchers(n)
  }
  inst.nodes = []
}

function performUpdate(moduleId: string): void {
  scheduled.delete(moduleId)
  updating = true
  try {
    const mod = modules.get(moduleId)
    if (!mod) return
    for (const [name, entry] of mod.keys) {
      if (!entry.live) {
        // 组件在本次模块求值中消失：卸载其实例并删除注册项
        for (const inst of entry.instances) unmountInstance(inst)
        mod.keys.delete(name)
        continue
      }
      for (const inst of [...entry.instances]) {
        // 已被父级 remount 认领的实例：记录已指向新树，无需独立换入
        if (claimed.has(inst)) continue
        remountInstance(mod, inst)
      }
    }
  } finally {
    updating = false
    // 批次（所有排队模块）结束才清空认领集
    if (scheduled.size === 0) claimed.clear()
  }
}

/** accept 与 afterUpdate 可能对同一次更新各触发一次：微任务批处理去重。 */
function scheduleUpdate(moduleId: string): void {
  if (scheduled.has(moduleId)) return
  scheduled.add(moduleId)
  queueMicrotask(() => performUpdate(moduleId))
}

const registry: KikoHmrRegistry = {
  beginModule(moduleId) {
    // 模块重求值属于更新批次的一部分：入口模块求值中的 render() 重渲染
    // 必须能认领现存实例，否则入口热更新会丢失全部组件状态。
    updating = true
    const mod = moduleEntry(moduleId)
    mod.fresh = false
    for (const entry of mod.keys.values()) entry.live = false
    moduleScope = { moduleId, index: 0 }
    // 模块体是同步求值的：显式 endModule 之外，微任务兜底清除作用域，
    // 防止求值中途抛错后作用域泄漏到后续的信号创建。
    queueMicrotask(() => {
      if (moduleScope?.moduleId === moduleId) moduleScope = null
    })
  },

  endModule(moduleId) {
    if (moduleScope?.moduleId === moduleId) moduleScope = null
    const mod = modules.get(moduleId)
    if (!mod) return
    mod.fresh = true
    if (mod.pending) {
      mod.pending = false
      scheduleUpdate(moduleId)
    }
  },

  ref(moduleId, name, impl) {
    const mod = moduleEntry(moduleId)
    const entry: KeyEntry = { impl: impl as Component, live: true, instances: [] }
    // 重复注册（同名组件在同一模块出现两次等异常情况）时保留旧实例
    const existing = mod.keys.get(name)
    if (existing) entry.instances = existing.instances
    mod.keys.set(name, entry)
    return (props: Props) => new KikoLazy(() => realize(mod, moduleId, name, entry.impl, props))
  },

  moduleUpdated(moduleId) {
    const mod = modules.get(moduleId)
    if (!mod) return
    if (mod.fresh) {
      scheduleUpdate(moduleId)
    } else {
      // 更新事件先于模块重求值到达（理论上不应发生）：挂起，待 endModule 补触发
      mod.pending = true
    }
  },

  takeSignal(initial) {
    if (instanceScope) {
      const idx = instanceScope.index++
      const prev = instanceScope.prev?.[idx]
      const kind = kindOf(initial)
      const sig =
        prev && prev.kind === kind ? new Signal.State(prev.signal.get()) : new Signal.State(initial)
      instanceScope.created.push({ kind, signal: sig })
      return sig
    }
    if (moduleScope) {
      const key = `${moduleScope.moduleId}#${moduleScope.index++}`
      let sig = moduleSignals.get(key)
      if (!sig) {
        sig = new Signal.State(initial)
        moduleSignals.set(key, sig)
      }
      return sig
    }
    return null
  },
}

/** 安装（幂等）并返回全局唯一的 HMR 注册表。 */
export function installHmr(): KikoHmrRegistry {
  const g = globalThis as Record<symbol, unknown>
  const existing = g[KIKO_HMR] as KikoHmrRegistry | undefined
  if (existing) return existing
  g[KIKO_HMR] = registry
  return registry
}
