# @kikojs/router

基于 `@kikojs/dom` 的声明式路由。支持 path / hash 两种模式、嵌套路由、路由守卫、`Link` / `Outlet` 导航原语与路由 hooks。

## 安装

```bash
bun add @kikojs/router
# 或
npm install @kikojs/router
```

## 快速开始

```tsx
import { createRouter, Router, Route, Link } from "@kikojs/router"
import { render } from "@kikojs/dom"

const router = createRouter({ mode: "path" })

function Home() {
  return <h1>Home</h1>
}

function About() {
  return <h1>About</h1>
}

render(
  <Router router={router}>
    <nav>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
    </nav>
    <Route path="/" component={Home} />
    <Route path="/about" component={About} />
  </Router>,
  document.getElementById("app")!,
)
```

## API

- **创建**：`createRouter(options)`（`mode: "path" | "hash"`）、`getRouteProps`
- **组件**：`Router`、`Route`、`Link`、`Outlet`、`Navigate`
- **Hooks**：`useRouter`、`useRoute`、`useParams`、`useQuery`、`useLocation`
- **导航**：`useNavigate`、`redirect`、`redirectReplace`、`buildPath`
- **守卫**：`createAuthGuard`、`combineGuards`、`createAsyncGuard`
- **历史**：`createPathHistory`、`createHashHistory`

## 文档

- 官网：<https://kiko-js.github.io/kiko/>
- 源码：<https://github.com/kiko-js/kiko>
