import { createSignal } from "@kikojs/dom"
import { computed } from "@kikojs/signal"

export interface Todo {
  id: number
  title: string
  done: boolean
}

export interface Board {
  runtime: string
  evaluatedAt: string
  todos: Todo[]
}

// 客户端模块级信号：热更新重新求值时按「模块 + 创建序」复用旧信号对象，身份与
// 值都保留——保存本文件后，已经拉到的服务端数据不会被重置。
export const board = createSignal<Board | null>(null)
export const status = createSignal<"idle" | "loading" | "error">("idle")

// 派生视图：直接交给 For / 文本绑定消费。
export const todos = computed<Todo[]>(() => board.get()?.todos ?? [])
export const runtime = computed(() => board.get()?.runtime ?? "…")
export const evaluatedAt = computed(() => board.get()?.evaluatedAt ?? "…")

async function request<T>(path: string, init?: { method: string; body: string }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init ? { "content-type": "application/json" } : undefined,
    body: init?.body,
  })
  if (!response.ok) throw new Error(`${path} → ${response.status}`)
  return (await response.json()) as T
}

/** 拉取服务端状态（`GET /api/board`）。 */
export async function refresh(): Promise<void> {
  status.set("loading")
  try {
    board.set(await request<Board>("/api/board"))
    status.set("idle")
  } catch {
    status.set("error")
  }
}

/** 新增待办（`POST /api/todos`），随后刷新。 */
export async function addTodo(title: string): Promise<void> {
  await request<Todo>("/api/todos", { method: "POST", body: JSON.stringify({ title }) })
  await refresh()
}

/** 切换完成状态（`POST /api/todos/toggle`），随后刷新。 */
export async function toggleTodo(id: number): Promise<void> {
  await request<Todo>("/api/todos/toggle", { method: "POST", body: JSON.stringify({ id }) })
  await refresh()
}
