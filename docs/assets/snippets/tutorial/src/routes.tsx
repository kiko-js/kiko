/** @jsxImportSource @kikojs/dom */
import { createRouter } from "@kikojs/router"
import type { RouteRecord } from "@kikojs/router"
import { HomePage } from "./pages/home"
import { NotFoundPage } from "./pages/not-found"
import { TasksPage } from "./pages/tasks"
import { UserPage } from "./pages/user"

/** 路由表：路径 → 组件。path: "*" 是兜底（404）。 */
export const routes: RouteRecord[] = [
  { path: "/", component: HomePage },
  { path: "/tasks", component: TasksPage },
  { path: "/users/:id", component: UserPage },
  { path: "*", component: NotFoundPage },
]

/**
 * mode: "path" 用 History API（需要服务端把任意路径回落到 index.html，
 * 见 server.ts）；换成 "hash" 则走 #/path，静态托管无需兜底。
 */
export const router = createRouter({ mode: "path", routes })
