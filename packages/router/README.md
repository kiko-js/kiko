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
