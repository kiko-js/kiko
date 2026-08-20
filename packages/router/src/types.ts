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
export interface RouteRecord {
  /** 路径模式，如 /users/:id */
  path: string
  /** 匹配成功后渲染的组件 */
  component?: (props: RouteComponentProps) => Node
  /** 嵌套路由 */
  children?: RouteRecord[]
  /** 任意元数据 */
  meta?: Record<string, unknown>
  /** 进入该路由前的守卫 */
  beforeEnter?: RouteGuard
  /** 离开该路由前的守卫 */
  beforeLeave?: RouteGuard
  /** 重定向目标 */
  redirect?: string | ((to: RouteLocation, from: RouteLocation | null) => string | Promise<string>)
}

/** 路由组件 props */
export interface RouteComponentProps {
  params: RouteParams
  query: RouteQuery
  location: RouteLocation
  router: Router
}

/** 守卫可以返回的结果 */
export type RouteGuardResult =
  | boolean
  | string
  | RedirectDescriptor
  | undefined
  | Promise<boolean | string | RedirectDescriptor | undefined>

/** 重定向描述 */
export interface RedirectDescriptor {
  path: string
  replace?: boolean
  state?: unknown
}

/** 路由守卫签名 */
export type RouteGuard = (
  to: RouteLocation,
  from: RouteLocation | null,
  router: Router,
) => RouteGuardResult

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
  readonly params: Signal.Computed<RouteParams>
  readonly query: Signal.Computed<RouteQuery>
  readonly matched: Signal.Computed<RouteMatch[]>
  readonly currentRoute: Signal.Computed<RouteRecord | null>
  navigate(to: string | number, options?: NavigateOptions): Promise<void>
  push(to: string, state?: unknown): void
  replace(to: string, state?: unknown): void
  back(): void
  forward(): void
  go(delta: number): void
  dispose(): void
  beforeEach(guard: RouteGuard): () => void
  afterEach(hook: (to: RouteLocation, from: RouteLocation | null) => void): () => void
}

/** 路由配置 */
export interface RouterOptions {
  /** 路由模式，默认 path */
  mode?: RouteMode
  /** 路由表 */
  routes?: RouteRecord[]
  /** 全局前置守卫 */
  beforeEach?: RouteGuard | RouteGuard[]
  /** 全局后置钩子 */
  afterEach?: ((to: RouteLocation, from: RouteLocation | null) => void)[]
  /** 基础路径（path 模式下生效） */
  base?: string
}
