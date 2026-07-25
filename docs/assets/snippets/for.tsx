import { For, createSignal } from "@kikojs/dom"

const todos = createSignal([
  { id: 1, text: "学习 signal" },
  { id: 2, text: "写 kiko 组件" },
])

<ul>
  <For each={todos}>
    {(todo, index) => <li>{index()}. {todo.text}</li>}
  </For>
</ul>
