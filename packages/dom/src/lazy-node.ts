/**
 * 惰性 JSX:组件体不再在 JSX 构造点执行,而是返回 `KikoLazy` 占位,在消费点
 * (appendChild / toNodes / hydrateValue / render / createPortal)解包执行。
 *
 * 组件体的求值时机从「JSX 构造点」推迟到「父组件作用域内」,children 不再
 * 先于父组件求值;未展示的分支(Show fallback 等)组件体不执行。
 *
 * 识别用 `Symbol.for` 注册的品牌标记而不是 instanceof:同一页面可能加载两份
 * 库(如测试里 src 导入与包名导入并存),instanceof 跨实例失效会把另一份
 * 实例的 Lazy 当普通值字符串化。
 *
 * 公开出口:`realize`(同步物化并保持节点身份)与组件级 `ref`。
 * 内部实现细节,不属于公共 API。
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

/** 解包到非 Lazy 为止(组件体内部可能再产出 Lazy)。 */
export function realizeLazy(value: unknown): unknown {
  while (isLazy(value)) value = (value as KikoLazy).build()
  return value
}
