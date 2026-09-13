---
name: kiko/router
description: >-
  @kikojs/router 配置驱动路由：createRouter、Router/Link/Outlet/Navigate 组件、
  useRouter/useParams/useQuery/useLocation/useRoute/useNavigate/useIsActive/useMatch
  hooks（返回响应式访问器 ReactiveSnapshot）、嵌套路由、动态参数、query/hash、
  守卫（beforeEnter/beforeLeave/beforeEach、redirect）、scrollBehavior、keepAlive、
  catch-all 404、path/hash/memory 三种 history、SSR（withSSRRouter）与水合。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/dom-rendering
---

# Router（@kikojs/router）

声明式配置路由表，组件渲染当前匹配。导航、参数、query、守卫与 URL 状态由信号驱动。

## 基础用法

```tsx
/** @jsxImportSource @kikojs/dom */
import { createRouter, Router, Link, Outlet, useParams } from "@kikojs/router"
import { computed } from "@kikojs/signal"

const routes = [
  { path: "/", component: () => <h1>Home</h1> },
  { path: "/about", component: () => <h1>About</h1> },
  { path: "/users/:id", component: UserPage }, // 动态参数
  { path: "*", component: () => <h1>404</h1> }, // catch-all 兜底
]

function App() {
  const router = createRouter({ mode: "path", routes }) // "path" | "hash" | "memory"
  return (
    <Router router={router}>
      <nav>
        <Link to="/" activeClass="active">
          Home
        </Link>
        <Link to="/about">About</Link>
      </nav>
      <Outlet /> {/* 渲染当前匹配的路由组件 */}
    </Router>
  )
}

function UserPage() {
  const params = useParams()
  const id = computed(() => params.id) // 响应式：/users/1 → /users/2 自动更新
  return <h1>用户 {id}</h1>
}
```

`Router` 挂载路由实例并注入上下文（hooks/Link/Outlet 的子树需在其内）；卸载时自动 `router.dispose()`。

## 组件

- `Router router={…}`：`children` 支持词法 JSX（已在 Router 帧内求值，精确绑定内层）与 thunk `{() => node}`（兼容形态）。
- `Link`：`to`、`activeClass`、`exact`、`replace`、`state`、`class` 及任意 `<a>` 属性透传。修饰键点击 / `target` 非 `_self` 不拦截；无 router 时回退 `location.href`。
- `Outlet`：渲染当前匹配；`keepAlive?: boolean | { max?: number }` 离屏保留；`keyBy?: (entry, router) => unknown` 自定义实例键（默认 `route.path`）。异步路由组件需自行包 `<Suspend>`。
- `Navigate to replace state`：渲染即导航，`replace` 默认 **true**，不渲染 DOM。

## Hooks

所有参数类 hook 返回 **`ReactiveSnapshot<T>`**（响应式访问器）：`useParams()`、`useParams().get()`、`useParams().id` 三种读法等价。

| hook                           | 返回                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| `useRouter()`                  | 当前 `Router` 实例（无上下文时抛错）                          |
| `tryUseRouter()`               | 可能为 `null` 的版本                                          |
| `useParams()` / `useQuery()`   | `ReactiveSnapshot<RouteParams>` / `<RouteQuery>`              |
| `useLocation()` / `useRoute()` | 当前 location / `{ route, matched, params, query, location }` |
| `useIsActive(to, { exact? })`  | `ReactiveSnapshot<boolean>`（与 Link 同款分段匹配）           |
| `useMatch(pattern)`            | `ReactiveSnapshot<RouteParams \| null>`                       |
| `useNavigate()`                | `(to, { replace, state }) => Promise`，也可传数字（go）       |
| `setActiveRouter(r)`           | 预置活动 router（客户端 Router 挂载 / 测试用；服务端勿用）    |

**组件只执行一次**：`params`/`query` 变化不会重跑组件。要响应式消费，把 hook 放进 `computed`/effect/JSX 绑定；也可直接用 `router.location` / `router.path` / `router.params` / `router.query` / `router.matched` / `router.currentRoute` 信号。编程式导航：`router.push/replace/back/forward/go`，组件内用 `useNavigate()`。

## 守卫与重定向

```tsx
const routes = [
  {
    path: "/admin",
    component: Admin,
    beforeEnter: () => isAuthed() || redirect("/login"),
    beforeLeave: () => confirm("确定离开？"),
  },
]
```

- 全局前置：`RouterOptions.beforeEach`（数组按序）；全局后置：`RouterOptions.afterEach`（成功导航后调用）。
- `redirect(path)` / `redirectReplace(path)`；守卫返回字符串即视为 `{ path }`；返回 `false` 中止，`true`/`undefined` 放行；支持 Promise。
- `combineGuards(...)`、`createAuthGuard(predicate, redirectTo)`。
- 执行顺序：全局 `beforeEach` → matched（浅→深）的 `redirect`/`beforeEnter` → from 链（浅→深）的 `beforeLeave`；重定向深度上限 `10`，超出抛 `Too many redirects`。

## keepAlive（离屏保留）

```tsx
const routes = [{ path: "/list", component: List, keepAlive: true }]

// 覆盖 / 关闭：keepAlive={false}
const view = <Outlet keepAlive={{ max: 5 }} />
```

切走时保留该路由子树（组件不重跑、状态不丢），再次进入原样恢复；缓存按插入序 LRU 淘汰，默认上限 10。后代路由标记了 keepAlive 时祖先层级连带保留。

## 工具、History 与类型

- `router.location`（State）、`router.path`（仅路径）、`router.params`/`query`/`matched`/`currentRoute`（Computed）、`router.ready`（初始导航 Promise，SSR 渲染前必须 await）。
- `getRouteProps(router)` → `{ params, query, location, router }`；`buildPath` / `getQueryValue` / `pathsEqual` / `navigateFrom`。
- History 适配器：`createPathHistory` / `createHashHistory`（客户端专用，读 `window`）、`createMemoryHistory(initialPath)`（无 DOM 依赖）；`mode: "memory"` 为一等模式。传入 `history` 时 `mode` 取自 `history.kind`。
- `defineRoutes(routes)` 保留字面量类型；`RoutePaths<typeof routes>` 得到导航路径联合，用 `declare module "@kikojs/router"` 合并 `RouterPaths`/`RouteMeta` 获得全库校验与 meta 类型。
- 路径模式：`:param`、`:param?`、`:param(正则)`、`*`（段级通配存入 `params["*"]`）；嵌套 children 写相对路径。
- `scrollBehavior` 配置后接管 `history.scrollRestoration`（引用计数，最后 dispose 时恢复）。

## SSR 与水合

```tsx
import { createRouter, Outlet } from "@kikojs/router"
import { createMemoryHistory } from "@kikojs/router"
import { withSSRRouter } from "@kikojs/router/server"
import { renderToFragment } from "@kikojs/dom/server"

const router = createRouter({ history: createMemoryHistory(requestUrlPath), routes }) // 服务端必须 memory
await router.ready // 初始守卫 / 重定向落定
const html = await withSSRRouter(router, () => renderToFragment(() => <Outlet />))
```

- `withSSRRouter` 用 AsyncLocalStorage 按请求隔离，并发安全；**服务端不要调用 `setActiveRouter`**（模块级全局会互相覆盖）。
- SSR 下：`Link` 只输出静态 `<a href>`；`Navigate` 输出空（客户端 effect 触发）；`Outlet` 静态渲染当前匹配。
- 水合：`hydrate(() => <Router router={clientRouter}>…</Router>, container)` 直接采纳 SSR 产物；客户端按真实 URL 重建 router，路由表需与服务端一致。

## 陷阱

- **path/hash history 客户端专用**：SSR 必须 `createMemoryHistory` + `withSSRRouter` + `await router.ready`。
- **路由参数不是 props 快照**：同一路由身份下组件不重跑，params/query 变化必须经 hooks / `router.*` 信号消费。
- **卸载清理挂在 marker 上**：Router/Outlet 的 cleanup 不能挂在会被 render()/swapNodes 抽干的 fragment 上。
- 隐式 router 解析顺序：渲染帧 → SSR 请求作用域（ALS）→ `activeRouter` 信号；首个非空 router **一次性绑定**，嵌套 `<Router>` 建议用词法 children 或 thunk 均可，但不要依赖外层 router 捕获内层。
