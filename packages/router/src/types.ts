import type { Signal } from "signal-polyfill"

/** URL 参数映射 */
export type RouteParams = Record<string, string>

/** 查询参数值可以是单个字符串或字符串数组 */
export type RouteQuery = Record<string, string | string[]>

/** 路由模式：path（history）或 hash */
export type RouteMode = "path" | "hash"

/** 当前位置信息 */
export interface RouteLocation {
  /** 规范化后的路径（不包含查询字符串和 hash） */
  path: string
  /** hash 片段（不包含 #） */
  hash: string
  /** 解析后的查询参数 */
  query: RouteQuery
  /** 完整路径（包含查询字符串和 hash） */
  fullPath: string
  /** 通过 push/replace 传入的状态 */
  state: unknown
  /** 每次导航生成的唯一 key */
  key: string
}

/** 导航选项 */
export interface NavigateOptions {
  /** 是否替换当前历史记录 */
  replace?: boolean
  /** 随导航保存的状态 */
  state?: unknown
}

/** 路由记录 */
/**
 * Extract `:param` names from a path pattern into a params object type.
 * `"*"` and parameter-less paths yield `{}`.
 */
export type PathParams<T extends string> = T extends `${string}:${infer Head}/${infer Tail}`
  ? { [K in Head]: string } & PathParams<Tail>
  : T extends `${string}:${infer Head}`
    ? { [K in Head]: string }
    : {}

/** Params type for a record: literal paths get extracted params; plain `string` stays permissive. */
export type ParamsOf<T extends string> = string extends T ? RouteParams : PathParams<T>

/**
 * 路由记录。`path` 传字面量时（经 `defineRoutes`）组件 props 的 `params`
 * 会按 `:param` 段精确类型化；不标注则保持宽松的 `RouteParams`。
 */
export interface RouteRecord<T extends string = string> {
  /** 路径模式，如 /users/:id */
  path: T
  /** 匹配成功后渲染的组件 */
  component?: (props: RouteComponentProps<ParamsOf<T>>) => Node
  /**
   * 切走时离屏保留该路由子树（组件不重跑、状态不丢失），再次进入时原样恢复。
   * 子树内的后代路由标记了 keepAlive 时，祖先层级也会连带保留。
   */
  keepAlive?: KeepAlive
  /** 嵌套路由（相对路径，如父 "/users" 下的 "profile"） */
  children?: readonly RouteRecord[]
  /** 任意元数据——通过 `declare module "@kikojs/router"` 扩展 `RouteMeta` 获得类型 */
  meta?: RouteMeta
  /** 进入该路由前的守卫 */
  beforeEnter?: RouteGuard
  /** 离开该路由前的守卫 */
  beforeLeave?: RouteGuard
  /** 重定向目标 */
  redirect?:
    | NavPath
    | ((to: RouteLocation, from: RouteLocation | null) => NavPath | Promise<NavPath>)
}

/**
 * 路由元数据：默认空接口，用声明合并获得项目级类型——
 * `declare module "@kikojs/router" { interface RouteMeta { requiresAuth: boolean } }`
 */
export interface RouteMeta {}

/**
 * 导航目标注册表：默认空。用声明合并启用全库跳转目标的联合类型校验——
 * ```
 * export const routes = defineRoutes([...])
 * declare module "@kikojs/router" {
 *   interface RouterPaths { paths: RoutePaths<typeof routes> }
 * }
 * ```
 * 之后 `navigate` / `push` / `replace` / `<Link to>` / `<Navigate to>` /
 * 守卫返回值都只能取已配置的路径（拼写错误编译期报错，IDE 自动补全）。
 */
export interface RouterPaths {}

/** 解析后的导航目标类型；未增强 `RouterPaths` 时退化为 `string`（行为不变）。 */
export type NavPath = RouterPaths extends { paths: infer P }
  ? P extends string
    ? P
    : string
  : string

type SubPaths<P extends string, C> = C extends readonly [infer H, ...infer T]
  ? H extends { path: infer CP extends string }
    ?
        | (H extends { children: infer CC }
            ? CC extends readonly unknown[]
              ? RoutePathsOf<`${P}/${CP}`, CC>
              : never
            : `${P}/${CP}`)
        | SubPaths<P, T>
    : SubPaths<P, T>
  : never

type RoutePathsOf<P extends string, C> = P | SubPaths<P, C>

/**
 * 展开路由表为全部可导航路径的联合（含嵌套子路由的前缀拼接）。
 * 配合 `defineRoutes` 使用：`RoutePaths<typeof routes>`。
 */
export type RoutePaths<R> = R extends readonly [infer H, ...infer T]
  ? H extends { path: infer P extends string }
    ?
        | (H extends { children: infer C }
            ? C extends readonly unknown[]
              ? RoutePathsOf<P, C>
              : P
            : P)
        | RoutePaths<T>
    : RoutePaths<T>
  : never

/** 路由组件 props */
export interface RouteComponentProps<P extends RouteParams = RouteParams> {
  params: P
  query: RouteQuery
  location: RouteLocation
  router: Router
}

/** 守卫可以返回的结果 */
export type RouteGuardResult =
  | boolean
  | NavPath
  | RedirectDescriptor
  | undefined
  | Promise<boolean | NavPath | RedirectDescriptor | undefined>

/** 路由守卫签名 */
export type RouteGuard = (
  to: RouteLocation,
  from: RouteLocation | null,
  router: Router,
) => RouteGuardResult

/** 重定向描述 */
export interface RedirectDescriptor {
  path: NavPath
  replace?: boolean
  state?: unknown
}

/** history 层的原始位置快照（path 含 query，hash 不含 #） */
export interface HistoryLocation {
  path: string
  hash: string
  state: unknown
}

/** 离屏保留策略：true 使用默认上限；对象可配置最大保留条数（LRU 淘汰） */
export interface KeepAliveOptions {
  /** 最多同时保留多少个子树（默认 10），超出后按最近最少使用淘汰 */
  max?: number
}

/** 离屏保留开关：boolean 或带上限的配置对象 */
export type KeepAlive = boolean | KeepAliveOptions

/**
 * 滚动目标：坐标、元素（CSS 选择器或引用）或两者；`behavior` 透传给
 * 原生 `scrollTo` / `scrollIntoView`。
 */
export interface ScrollPosition {
  top?: number
  left?: number
  el?: string | Element
  behavior?: ScrollBehavior
}

/**
 * 滚动行为钩子：导航完成后调用。`savedPosition` 是目标历史条目离开时
 * 存储的滚动位置（仅前进/后退有值）。返回 `false` 或 `undefined` 跳过滚动；
 * 返回 Promise 可等待布局稳定后再滚。
 */
export type ScrollBehaviorHandler = (
  to: RouteLocation,
  from: RouteLocation | null,
  savedPosition: ScrollPosition | null,
) => ScrollPosition | false | void | Promise<ScrollPosition | false | void>

/** 条目级滚动位置（存入包装后的 history.state） */
export interface EntryScroll {
  top: number
  left: number
}

/**
 * 响应式 history 适配器：path / hash / memory 三种实现同构。
 * `location` 是唯一事实源——push/replace/go 与浏览器事件都会同步它；
 * router 用 effect 订阅以处理外部变化。同一实例可被多个 router 共享
 * （每个 router 独立观察并用自己的路由表处理变化）。
 */
export interface HistoryAdapter {
  readonly kind: "path" | "hash" | "memory"
  readonly location: Signal.State<HistoryLocation>
  push(path: string, state?: unknown): void
  replace(path: string, state?: unknown): void
  go(delta: number): void
  back(): void
  forward(): void
  /** 读/写当前历史条目存储的滚动位置（供 scrollBehavior 使用） */
  getEntryScroll(): EntryScroll | undefined
  setEntryScroll(scroll: EntryScroll | undefined): void
  dispose(): void
}

/** 匹配到的路由项 */
export interface RouteMatch {
  route: RouteRecord
  params: RouteParams
  remaining: string
}

/** 路由器实例（在 router.ts 中实现，此处只声明类型） */
export interface Router {
  readonly mode: RouteMode
  readonly base: string
  readonly location: Signal.State<RouteLocation>
  /** 仅路径部分（不含 query/hash）的信号——query/hash 变化不会触发依赖它的订阅 */
  readonly path: Signal.State<string>
  readonly params: Signal.Computed<RouteParams>
  readonly query: Signal.Computed<RouteQuery>
  readonly matched: Signal.Computed<RouteMatch[]>
  readonly currentRoute: Signal.Computed<RouteRecord | null>
  navigate(to: NavPath | number, options?: NavigateOptions): Promise<void>
  push(to: NavPath, state?: unknown): void
  replace(to: NavPath, state?: unknown): void
  back(): void
  forward(): void
  go(delta: number): void
  dispose(): void
  beforeEach(guard: RouteGuard): () => void
  afterEach(hook: (to: RouteLocation, from: RouteLocation | null) => void): () => void
}

/** 路由配置 */
export interface RouterOptions {
  /** 路由模式，默认 path。传入 `history` 时忽略，模式取自 `history.kind` */
  mode?: RouteMode
  /**
   * 注入 history 实例（可跨 router 共享）。缺省时按 `mode` 自建并拥有其生命周期。
   * 测试 / SSR / 无 DOM 环境用 `createMemoryHistory()`。
   */
  history?: HistoryAdapter
  /** 滚动行为钩子（配置后 router 接管 scrollRestoration） */
  scrollBehavior?: ScrollBehaviorHandler
  /** 路由表 */
  routes?: RouteRecord[]
  /** 全局前置守卫 */
  beforeEach?: RouteGuard | RouteGuard[]
  /** 全局后置钩子 */
  afterEach?: ((to: RouteLocation, from: RouteLocation | null) => void)[]
  /** 基础路径（path 模式下生效） */
  base?: string
}
