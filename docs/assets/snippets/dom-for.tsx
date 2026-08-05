/** @jsxImportSource @kikojs/dom */
import { For, createSignal } from "@kikojs/dom"

interface Todo {
  id: number
  text: string
}

const todos = createSignal<Todo[]>([
  { id: 1, text: "学习 signal" },
  { id: 2, text: "写 kiko 组件" },
])

const list = (
  <ul>
    {/* 非 keyed 协调：列表变化时做最小 DOM 操作 */}
    <For each={todos}>
      {(todo, index) => (
        <li>
          {index()}. {todo.text}
        </li>
      )}
    </For>
  </ul>
)
