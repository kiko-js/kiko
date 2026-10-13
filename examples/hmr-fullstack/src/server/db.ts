/**
 * 仅服务端的内存「数据库」：只有 `src/server/` 下的模块会 import 它，客户端
 * bundle 里不存在这段代码——浏览器看不到服务端状态。
 *
 * 保存本文件后：`bun --hot` 重新求值服务端模块图（模块级 `evaluatedAt` 刷新），
 * `/hmr` 端点广播整页刷新，浏览器重新拉取时就能看到新的种子数据 / 版本信息。
 */

export interface Todo {
  id: number
  title: string
  done: boolean
}

export interface Board {
  /** 服务端运行时版本。 */
  runtime: string
  /** 本模块最后一次求值的时间——改一次服务端代码就会变，用来确认软重载生效。 */
  evaluatedAt: string
  todos: Todo[]
}

/** 模块级状态：`bun --hot` 重新求值时跟着重置（不像 globalThis 那样保留）。 */
let nextId = 1

const todos: Todo[] = [
  { id: nextId++, title: "保存 src/server/db.ts：服务端软重载 + 整页刷新", done: false },
  { id: nextId++, title: "保存 src/app.tsx：客户端组件原位热替换", done: true },
]

const evaluatedAt = new Date().toISOString()

export function board(): Board {
  return { runtime: `Bun ${Bun.version}`, evaluatedAt, todos }
}

export function addTodo(title: string): Todo {
  const todo: Todo = { id: nextId++, title, done: false }
  todos.push(todo)
  return todo
}

export function toggleTodo(id: number): Todo | undefined {
  const todo = todos.find(item => item.id === id)
  if (todo) todo.done = !todo.done
  return todo
}
