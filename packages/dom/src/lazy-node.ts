/**
 * 惰性 jsx 原型（实验分支 exp/lazy-jsx）：
 *
 * `jsx(组件, props)` 不再急切执行组件体，而是返回 `KikoLazy`——一个在
 * 消费点（appendChild / toNodes / hydrateValue / render / createPortal）
 * 才解包执行组件体的占位对象。目的是把组件体的求值时机从「JSX 构造点」
 * 推迟到「父组件作用域内」，使 children 先于父组件求值的急切语义消失。
 *
 * 用 `Symbol.for` 注册的品牌标记做识别，而不是 instanceof：库可能被同一
 * 页面加载两份（如测试里 src 导入与包名导入并存），instanceof 跨实例
 * 失效会把另一份实例的 Lazy 当普通值字符串化。
 *
 * 内部实现细节，不属于公共 API。
 */
export const LAZY_BRAND = Symbol.for("kiko.lazy-node")

export class KikoLazy {
  readonly build: () => unknown
  constructor(build: () => unknown) {
    this.build = build
    ;(this as unknown as Record<symbol, unknown>)[LAZY_BRAND] = true
  }
}

export function isLazy(value: unknown): value is KikoLazy {
  return (
    value instanceof KikoLazy ||
    (typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[LAZY_BRAND] === true)
  )
}

/** 解包到非 Lazy 为止（组件体内部可能再产出 Lazy）。 */
export function realizeLazy(value: unknown): unknown {
  while (isLazy(value)) value = (value as KikoLazy).build()
  return value
}

/** 原型总开关：便于对比急切/惰性两种模式的测试行为。 */
export const lazyMode = { enabled: true }
