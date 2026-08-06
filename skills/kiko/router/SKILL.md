---
name: kiko/router
description: >-
  @kikojs/router 声明式路由：createRouter、Router/Route/Link/Outlet/Navigate
  组件、useRouter/useParams/useQuery/useLocation/useRoute/useNavigate hooks、
  嵌套路由、动态参数、query/hash、守卫（beforeEnter/beforeLeave/beforeEach、
  redirect）、path/hash 两种模式、createPathHistory/createHashHistory。
  目前仅客户端（Router/Link 使用 DOM API）。
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
- `Route path element`：`<Route path="/" element={<Home/>}/>`。
- `Link`：`to`、`activeClass`、`exact`（严格匹配）、`replace`、`target="_blank"`、修饰键（`modifier keys`）、多 class。激活态用 `activeClass`。
- `Outlet`：渲染当前匹配的子路由（嵌套布局）；无匹配可配合重定向/404。
- `Navigate to replace`：一次性导航（渲染即跳转）。

## Hooks

| hook                 | 返回                                             |
| -------------------- | ------------------------------------------------ |
| `useRouter()`        | 当前 `Router` 实例（无上下文时抛错）             |
| `tryUseRouter()`     | 可能为 undefined 版本                            |
| `useParams()`        | `Signal.Computed<RouteParams>` 当前参数          |
| `useQuery()`         | `Signal.Computed<RouteQuery>` 当前 query         |
| `useLocation()`      | `Signal.Computed<RouteLocation>` 当前位置        |
| `useRoute()`         | 当前匹配路由记录                                 |
| `useNavigate()`      | `nav(path, { replace })` 编程式导航              |
| `setActiveRouter(r)` | （模块槽模式）手动设置活动路由，供非组件环境使用 |

编程式导航：`nav("/x", { replace: true })`、`nav(-1)`（history 后退）等。

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
- `combineGuards(...)`、`createAuthGuard(...)`、`createAsyncGuard(...)`（`kiko` 的 guards 模块）。
- 重定向有深度上限 `MAX_REDIRECT_DEPTH = 10`，防循环。

## 工具

- `getRouteProps(router)`：把当前匹配转成 `{ params, query, location }`（`RouteComponentProps`），供非 JSX 或自定义渲染路径使用。
- `buildPath` / `getQueryValue` / `pathsEqual` / `useNavigate`。
- `createPathHistory` / `createHashHistory`：可注入的 history 适配器（测试/自定义后端）。
- 模式 `mode: "path"`（history API）或 `"hash"`（`#/path`，支持片段 `#/path#frag`）。
- 路由状态：`router.location`（State）、`router.params`/`router.query`（Computed）、`router.state`。

## 陷阱与限制

- **仅客户端**：`Router`/`Link` 使用 DOM API（history、window），SSR/水合下不可直接使用。SSR 场景需用 `getRouteProps` 直接渲染匹配路由（待正式支持）。
- 嵌套路由用 `RouteRecord.children`；叶子组件经 `Outlet` 承接。
- `useParams`/`useQuery` 返回 `Signal.Computed`——在 JSX 中直接放入属性/子节点以自动订阅，或在 `effect`/`.get()` 中读取快照。
- Link 的 activeClass 由 effect 驱动，卸载时自动清理监听。
