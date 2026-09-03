/** @jsxImportSource @kikojs/dom */
import { computed } from "@kikojs/signal"
import { createRouter, Router, Outlet, useParams, useQuery } from "@kikojs/router"
import type { RouteRecord } from "@kikojs/router"

const routes: RouteRecord[] = [
  // route.keepAlive：切走时离屏保留——组件不重跑、状态（表单/滚动/信号）不丢失
  { path: "/users/:id", component: UserPage, keepAlive: true },
  { path: "/settings", component: () => <h1>设置</h1> },
]

function UserPage() {
  // params / query 都是“数据”：变化不重建组件，靠信号响应式消费
  const id = computed(() => useParams().id)
  const page = computed(() => Number(useQuery().page ?? "1"))
  return (
    <div>
      <h1>用户 {id}</h1>
      <p>第 {page} 页</p>
    </div>
  )
}

const router = createRouter({ mode: "path", routes })

// 默认按路由身份复用实例；需要按参数区分实例时用 keyBy：
// const app = <Router router={router}><Outlet keyBy={entry => entry.params.id} /></Router>
const app = (
  <Router router={router}>
    <Outlet />
  </Router>
)
