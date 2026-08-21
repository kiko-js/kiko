# @kikojs/router

基于 `@kikojs/dom` 的声明式路由。支持 path / hash 两种模式、嵌套路由、路由守卫、`Link` / `Outlet` 导航原语与路由 hooks。

## 安装

```bash
bun add @kikojs/router
# 或
npm install @kikojs/router
```

## 快速开始

路由表通过 `createRouter({ routes })` 的 `routes` 配置声明，`<Outlet />` 负责渲染当前匹配到的路由组件。

```tsx
import { createRouter, Router, Link, Outlet } from "@kikojs/router"
import { render } from "@kikojs/dom"

function Home() {
  return <h1>Home</h1>
}

function About() {
  return <h1>About</h1>
}

const router = createRouter({
  mode: "path",
  routes: [
    { path: "/", component: Home },
    { path: "/about", component: About },
  ],
})

render(
  <Router router={router}>
    <nav>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
    </nav>
    <Outlet />
  </Router>,
  document.getElementById("app")!,
)
```

### catch-all / 404

顶层 `path: "*"` 的路由会作为 404 兜底，仅当没有任何其他路由匹配完整路径时生效：

```tsx
const router = createRouter({
  mode: "path",
  routes: [
    { path: "/", component: Home },
    { path: "*", component: () => <h1>404 Not Found</h1> },
  ],
})
```

### 类型化导航目标（可选）

默认所有跳转目标是 `string`。用 `defineRoutes` 声明路由表并做一次模块增强后，`navigate` / `push` / `replace` / `<Link to>` / `<Navigate to>` / 守卫返回值都会被约束为已配置路径的联合——拼写错误编译期报错，IDE 自动补全：

```ts
// routes.ts
import { defineRoutes, type RoutePaths } from "@kikojs/router"

export const routes = defineRoutes([
  { path: "/", component: Home },
  { path: "/users/:id", component: User, children: [{ path: "profile", component: Profile }] },
])

declare module "@kikojs/router" {
  interface RouterPaths {
    paths: RoutePaths<typeof routes> // "/" | "/users/:id" | "/users/:id/profile"
  }
}
```

路由记录的 `path` 传显式字面量泛型时，组件 props 的 `params` 按模式精确类型化：`RouteRecord<"/users/:id">` 的组件里 `params.id` 为 `string` 且拼错报错。`meta` 同样可通过扩展 `RouteMeta` 接口获得项目级类型。

### 可注入的响应式 history

history 是独立的响应式事实源（`location` 为信号），三种实现接口完全一致：

- `createPathHistory(base?)`——浏览器 History API；
- `createHashHistory()`——URL hash；
- `createMemoryHistory(initial?)`——纯内存条目栈，无 DOM 依赖，适用于测试、SSR 与非浏览器环境。

默认按 `mode` 自建并拥有其生命周期；也可以注入共享：

```ts
import { createRouter, createMemoryHistory } from "@kikojs/router"

const history = createMemoryHistory("/")
const router = createRouter({ history, routes }) // mode 取自 history.kind
```

同一 history 实例可被多个 router 共享：每个 router 独立观察位置变化并用自己的路由表与守卫处理。注入时 router 不拥有 history——`dispose()` 只解绑自身。

## API

- **创建**：`createRouter(options)`（`mode: "path" | "hash"`）、`getRouteProps`
- **组件**：`Router`、`Link`、`Outlet`、`Navigate`
- **Hooks**：`useRouter`、`useRoute`、`useParams`、`useQuery`、`useLocation`、`useIsActive`、`useMatch`、`useNavigate`
- **导航**：`useNavigate`、`redirect`、`redirectReplace`、`buildPath`
- **守卫**：`createAuthGuard`、`combineGuards`、`createAsyncGuard`
- **历史**：`createPathHistory`、`createHashHistory`

## 文档

- 官网：<https://kiko-js.github.io/kiko/>
- 源码：<https://github.com/kiko-js/kiko>
