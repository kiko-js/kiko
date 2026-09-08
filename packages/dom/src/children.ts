import { isLazy, KikoLazy } from "./lazy-node"

/**
 * 检查型 children 工具：父组件在**不执行子组件体**的前提下检查/筛选 children。
 *
 * 背景：组件 JSX 是惰性占位（`KikoLazy`，构造点记录了 `tag`/`props`），
 * 父组件体先于子组件体执行。`Tabs` 这类"按类型/props 选择子元素"的父组件
 * 可直接读占位上的 `tag`/`props`，只 `realize` 被选中的分支——未选中的
 * 子组件体永不执行（不建信号、不挂 watcher）。
 */

/** 展平 children：递归展开数组，丢弃 null/undefined/布尔值。占位与信号保持不透明（不求值）。 */
export function toArray(children: unknown): unknown[] {
  const out: unknown[] = []
  const walk = (value: unknown): void => {
    if (value == null || value === false || value === true) return
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    out.push(value)
  }
  walk(children)
  return out
}

/** 占位的组件 tag（`jsx()` 构造点记录）；非占位返回 undefined。 */
export function childTag(child: unknown): unknown {
  return isLazy(child) ? (child as KikoLazy).tag : undefined
}

/** 占位的 props（`jsx()` 构造点记录，不含 `ref` 剥离前的原对象）；非占位返回 undefined。 */
export function childProps(child: unknown): unknown {
  return isLazy(child) ? (child as KikoLazy).props : undefined
}
