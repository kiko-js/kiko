/**
 * 服务端 API 处理器（仅服务端）。接收标准 `Request`、返回标准 `Response`——
 * 不依赖 Bun 专有类型，换成任意 Fetch API 宿主也能复用；接线在 `server.tsx`。
 *
 * 与 `db.ts` 一起被 watcher 监听：改这里保存后 `bun --hot` 重新求值，`/hmr`
 * 端点广播整页刷新。
 */
import { withNoCache } from "@kikojs/hmr"
import { addTodo, board, toggleTodo as toggle } from "./db"

/** GET /api/board：整块状态（运行时版本 / 求值时间 / 待办列表）。 */
export function getBoard(): Response {
  // 开发期让浏览器每次都真的回服务端，方便观察软重载。
  return withNoCache(Response.json(board()))
}

/** POST /api/todos：新增一条待办，body 为 `{ title }`。 */
export async function createTodo(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { title?: unknown } | null
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  if (!title) return Response.json({ error: "title is required" }, { status: 400 })
  return Response.json(addTodo(title), { status: 201 })
}

/** POST /api/todos/toggle：切换完成状态，body 为 `{ id }`。 */
export async function toggleTodo(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof body?.id === "number" ? body.id : Number(body?.id)
  const todo = Number.isFinite(id) ? toggle(id) : undefined
  if (!todo) return Response.json({ error: "todo not found" }, { status: 404 })
  return Response.json(todo)
}
