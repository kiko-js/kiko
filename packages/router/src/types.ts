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

/** 重定向描述 */
export interface RedirectDescriptor {
  path: NavPath
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
