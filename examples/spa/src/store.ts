/**
 * 应用状态：模块级信号。全局可见、默认响应式，不需要 Provider / 上下文嵌套。
 * 组件函数只执行一次，所以状态放在模块里、绑定在 JSX 里是最自然的写法。
 */
import { computed, createSignal } from "@kikojs/signal"

export interface Task {
  id: number
  title: string
  done: boolean
}

/** 可写状态：任务列表 */
export const tasks = createSignal<Task[]>([
  { id: 1, title: "读完 dom API 参考", done: true },
  { id: 2, title: "用 signal 管理应用状态", done: false },
])

/** 派生状态：只依赖 tasks，未完成数量变化时才通知订阅者 */
export const remaining = computed(() => tasks.get().filter(task => !task.done).length)

let nextId = 3

export function addTask(title: string): void {
  const trimmed = title.trim()
  if (!trimmed) return
  tasks.set([...tasks.get(), { id: nextId++, title: trimmed, done: false }])
}

export function toggleTask(id: number): void {
  tasks.set(tasks.get().map(task => (task.id === id ? { ...task, done: !task.done } : task)))
}

export function removeTask(id: number): void {
  tasks.set(tasks.get().filter(task => task.id !== id))
}
