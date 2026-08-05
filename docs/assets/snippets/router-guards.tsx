/** @jsxImportSource @kikojs/dom */
import { createRouter, Router, Outlet, createAuthGuard } from "@kikojs/router"

const isLoggedIn = () => !!localStorage.getItem("token")

// 守卫返回 false 时重定向到 /login
const router = createRouter({
  mode: "path",
  routes: [
    { path: "/login", component: () => <h1>登录</h1> },
    { path: "/dashboard", component: () => <h1>控制台</h1> },
  ],
  beforeEach: createAuthGuard(isLoggedIn, "/login"),
})

const app = (
  <Router router={router}>
    <Outlet />
  </Router>
)
