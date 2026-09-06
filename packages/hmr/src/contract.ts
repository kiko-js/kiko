import type { Signal } from "signal-polyfill"

/**
 * HMR 运行时契约。插件注入的代码与 `createSignal`（任何一份 @kikojs/dom
 * 副本）都通过 `globalThis[KIKO_HMR]` 找到唯一的注册表实例——Symbol.for
 * 保证双包加载（测试里源码与包名并存）时也指向同一个对象。
 */
export const KIKO_HMR: unique symbol = Symbol.for("kiko:hmr")

export interface KikoHmrRegistry {
  /** 插件注入：模块求值开始。建立模块级信号身份作用域并复位 live 标记。 */
  beginModule(moduleId: string): void
  /** 插件注入：模块求值结束。清除作用域、标记 fresh、补触发 pending 更新。 */
  endModule(moduleId: string): void
  /** 插件注入：注册组件实现，返回追踪实例的包装函数。 */
  ref(moduleId: string, name: string, impl: unknown): unknown
  /** 插件注入：模块自身变更（accept 回调，mod 为新模块导出；依赖冒泡时 mod 为 null）。 */
  moduleUpdated(moduleId: string, mod: unknown): void
  /**
   * `createSignal` 钩子：处于实例/模块作用域时返回应复用的信号（值与身份
   * 保留），否则返回 null。
   */
  takeSignal(initial: unknown): Signal.State<unknown> | null
}

export function getHmrRegistry(): KikoHmrRegistry | undefined {
  return (globalThis as Record<symbol, unknown>)[KIKO_HMR] as KikoHmrRegistry | undefined
}
