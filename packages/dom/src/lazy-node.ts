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
  /**
   * 构造点已知的组件 tag 与 props（检查用，不触发执行）。
   * 父组件可据此筛选 children（如 Tabs 按类型/props 选子），无需 realize。
   * 非组件来源（HMR defer 等）为 undefined；跨实例品牌识别不受影响。
   */
  readonly tag: unknown
  readonly props: unknown
  constructor(build: () => unknown, tag?: unknown, props?: unknown) {
    this.build = build
    this.tag = tag
    this.props = props
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

const realized = new WeakMap<KikoLazy, unknown>()

/**
 * 解包到非 Lazy 为止(组件体内部可能再产出 Lazy)。
 *
 * 结果按 Lazy 对象缓存:组件函数必须恰好执行一次,重复 realize(如 HMR 重渲染
 * 复用 props.children 时)返回同一批节点,而不是把组件体跑第二遍产出重复 DOM。
 */
export function realizeLazy(value: unknown): unknown {
  while (isLazy(value)) {
    const cached = realized.get(value)
    if (cached !== undefined) {
      value = cached
      continue
    }
    const next = (value as KikoLazy).build()
    realized.set(value, next)
    value = next
  }
  return value
}
