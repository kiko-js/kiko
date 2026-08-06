/** @jsxImportSource @kikojs/dom */
import { createSignal, Style, Show, For, Suspend, lazy } from "@kikojs/dom"
import { computed } from "@kikojs/signal"

// 代码分割：SSR 阶段服务端 await 该模块并输出内容；客户端 bundle 将其拆为
// 独立 chunk，水合时模块未加载完成 → Suspend 静态采纳 SSR 内容，settle 后换入
// 客户端节点并挂上绑定。
const ClockCard = lazy(() => import("./lazy-card").then(m => m.default))

export function App() {
  const count = createSignal(0)
  const visible = createSignal(true)
  const todos = createSignal([
    { id: 1, text: "SSR 输出的初始列表" },
    { id: 2, text: "水合后可增删" },
    { id: 3, text: "keyed For 就地更新" },
  ])
  const doubled = computed(() => count.get() * 2)

  const addTodo = (): void => {
    const list = todos.get()
    const nextId = list.length === 0 ? 1 : list[list.length - 1]!.id + 1
    todos.set([...list, { id: nextId, text: `新任务 ${nextId}` }])
  }
  const removeTodo = (): void => {
    const list = todos.get()
    if (list.length === 0) return
    todos.set(list.slice(0, -1))
  }

  return (
    <main>
      <Style>{`
        h1 { color: #2563eb }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin: 1rem 0 }
        button { padding: 0.4rem 0.8rem; margin-right: 0.4rem; cursor: pointer }
        .muted { color: #6b7280 }
      `}</Style>

      <h1>kiko SSR + 水合</h1>
      <p class="muted">服务端渲染的 HTML，客户端水合后事件与信号绑定生效。</p>

      <section class="card">
        <h2>计数器（信号）</h2>
        <p>
          count = {count}，doubled = {doubled}
        </p>
        <button onClick={() => count.set(count.get() + 1)}>+1</button>
        <button onClick={() => count.set(count.get() - 1)}>-1</button>
        <button onClick={() => count.set(0)}>reset</button>
      </section>

      <section class="card">
        <h2>Show（条件渲染）</h2>
        <button onClick={() => visible.set(!visible.get())}>toggle</button>
        <Show when={visible} fallback={<p class="muted">当前隐藏</p>}>
          <p>当前可见</p>
        </Show>
      </section>

      <section class="card">
        <h2>For（keyed 列表）</h2>
        <button onClick={addTodo}>add</button>
        <button onClick={removeTodo}>remove last</button>
        <ul>
          <For each={todos} getKey={t => t.id}>
            {item => <li>{item().text}</li>}
          </For>
        </ul>
      </section>

      <section class="card">
        <h2>Suspend + lazy（代码分割）</h2>
        <Suspend fallback={<p class="muted">加载中…</p>}>
          <ClockCard />
        </Suspend>
      </section>
    </main>
  )
}
