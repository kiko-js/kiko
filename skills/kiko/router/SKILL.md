---
name: kiko/router
description: >-
  @kikojs/router 配置驱动路由：createRouter、Router/Link/Outlet/Navigate
  组件、useRouter/useParams/useQuery/useLocation/useRoute/useNavigate/useIsActive/
  useMatch hooks、嵌套路由、动态参数、query/hash、守卫（beforeEnter/beforeLeave/
  beforeEach、redirect）、scrollBehavior 滚动管理、keepAlive 离屏保留、catch-all
  404、path/hash/memory 三种 history、SSR 字符串渲染（withSSRRouter）。
  客户端水合（Router 树）已支持（SSR 产物直接 `hydrate`）。
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
import type { RouteRecord } from "@kikojs/router"

const routes: RouteRecord[] = [
  { path: "/", component: () => <h1>Home</h1> },
  { path: "/about", component: () => <h1>About</h1> },
  { path: "/users/:id", component: UserPage }, // 动态参数
]

function App() {
  const router = createRouter({ mode: "path", routes }) // "path" | "hash"
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
  const params = useParams() // 当前路由参数快照：{ id: "42" }
  return <h1>用户 {params.id}</h1>
}
```

## 组件

- `Router router={…}`：挂载路由实例，提供上下文（需在使用 hooks/Link/Outlet 的子树外层）。
- `Link`：`to`、`activeClass`、`exact`（严格匹配）、`replace`、`target="_blank"`、修饰键（`modifier keys`）、多 class。激活态用 `activeClass`。
- `Outlet`：渲染当前匹配的子路由（嵌套布局）；无匹配可配合重定向/404。
- `Navigate to replace`：一次性导航（渲染即跳转）。

## Hooks

| hook                                                                                                                                             | 返回                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `useRouter()`                                                                                                                                    | 当前 `Router` 实例（无上下文时抛错）                                    |
| `tryUseRouter()`                                                                                                                                 | 可能为 undefined 版本                                                   |
| `useParams()`                                                                                                                                    | `Signal.Computed<RouteParams>` 当前参数                                 |
| `useQuery()`                                                                                                                                     | `Signal.Computed<RouteQuery>` 当前 query                                |
| `useLocation()`                                                                                                                                  | `Signal.Computed<RouteLocation>` 当前位置                               |
| `useNavigate()`                                                                                                                                  | `(to, { replace, state }) => Promise`，也可传数字（go）                 |
| `setActiveRouter(r)`                                                                                                                             | 预置活动 router（客户端 Router 挂载与测试用；服务端用 `withSSRRouter`） |
| 编程式导航：`router.push(path)` / `router.replace(path)` / `router.back()` / `router.forward()` / `router.go(delta)`；组件内用 `useNavigate()`。 |

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

- 全局守卫：`RouterOptions.beforeEach`。
- `redirect(path)` / `redirectReplace(path)`；守卫返回字符串即视为 `{ path }` 重定向；返回 `false` 中止导航。
- `combineGuards(...)`、`createAuthGuard(...)`（`kiko` 的 guards 模块）。
- 重定向有深度上限 `MAX_REDIRECT_DEPTH = 10`，防循环。

## 工具

- `getRouteProps(router)`：把当前匹配转成 `{ params, query, location }`（`RouteComponentProps`），供非 JSX 或自定义渲染路径使用。
- `buildPath` / `getQueryValue` / `pathsEqual` / `useNavigate`。
- `createPathHistory` / `createHashHistory` / `createMemoryHistory`：可注入的 history 适配器（SSR/测试用 memory）。
- 模式 `mode: "path"`（history API）或 `"hash"`（`#/path`，支持片段 `#/path#frag`）。
- 路由状态：`router.location`（State）、`router.path`/`router.params`/`router.query`/`router.matched`/`router.currentRoute`（Computed）、`router.ready`（初始导航 Promise，SSR 渲染前必须 await）。

## 陷阱与限制

- **path/hash history 客户端专用**：读取 `window`。SSR 用 `createMemoryHistory` +
  `withSSRRouter`（`@kikojs/router/server`，AsyncLocalStorage 按请求隔离，并发渲染
  安全），渲染前 `await router.ready`（初始守卫/重定向落定）。
- **水合已支持**：`hydrate(() => <Router router={clientRouter}>…</Router>, container)`
  直接采纳 SSR 产物；客户端按真实 URL 重建 router，路由表需与服务端一致。
  `<Navigate>` 水合输出为空，导航由客户端 effect 触发。
- **卸载清理**：Router 的 cleanup 挂在随子树移动的 marker 上——挂 container
  fragment 会被 render()/swapNodes 抽干，cleanup 永远不执行。
- 隐式注入 = 渲染帧（Router/Outlet 渲染子树期间压帧）→ 请求作用域（ALS）→
  activeRouter 信号，首次解析到非空后**一次性绑定**（组件只跑一次，其后挂载的
  其他 Router 不串扰）。kiko 的 jsx 急切执行组件：`<Router>` 的 JSX children
  先于 Router 体运行、走信号兜底；**嵌套 `<Router>` 必须用 thunk children**
  （`<Router router={inner}>{() => <Outlet />}</Router>`）才能精确绑定内层。
- 嵌套路由用 `RouteRecord.children`；叶子组件经 `Outlet` 承接。
- Link 的 activeClass 由 effect 驱动，卸载时自动清理监听。

## SSR

```tsx
import { createRouter, Outlet } from "@kikojs/router"
import { withSSRRouter } from "@kikojs/router/server"
import { renderToFragment } from "@kikojs/dom/server"

const router = createRouter({
  history: createMemoryHistory(requestUrlPath), // 服务端必须 memory
  routes,
})
const html = await withSSRRouter(router, () => renderToFragment(() => <Outlet />))
```

解析顺序：`Outlet` 显式 `router` prop → 渲染帧 → 请求作用域（`withSSRRouter`）→ `setActiveRouter` 预置。
服务端完整流程：`await router.ready` → `withSSRRouter(...)`。
客户端水合：`hydrate(() => <Router router={clientRouter}>…</Router>, container)`。
