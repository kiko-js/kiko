/** @jsxImportSource @kikojs/dom */
import { computed } from "@kikojs/signal"
import { createRouter, Router, Link, Outlet, useParams } from "@kikojs/router"
import type { RouteRecord } from "@kikojs/router"

// 路由表：声明式配置，支持嵌套、动态参数、守卫与重定向
const routes: RouteRecord[] = [
  { path: "/", component: () => <h1>Home</h1> },
  { path: "/about", component: () => <h1>About</h1> },
  { path: "/users/:id", component: UserPage },
]

function App() {
  const router = createRouter({ mode: "path", routes })

  return (
    <Router router={router}>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about" activeClass="active">
          About
        </Link>
      </nav>
      {/* Outlet 渲染当前匹配的路由组件；同一路由身份只渲染一次，
           params/query 变化由组件内部信号响应式处理 */}
      <Outlet />
    </Router>
  )
}

function UserPage() {
  const id = computed(() => useParams().id) // 响应式参数：{ id: "42" }
  return <h1>用户 {id}</h1>
}
