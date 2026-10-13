/** @jsxImportSource @kikojs/dom */
import { For, Show } from "@kikojs/dom"
import { computed, createSignal } from "@kikojs/signal"
import { Counter } from "./counter"
import { addTodo, evaluatedAt, refresh, runtime, status, todos, toggleTodo } from "./store"

/**
 * 顶层客户端组件：被插件改写成注册表包装，保存后原位热替换。首次加载在组件体
 * 里发起（组件只执行一次），保存其余组件时不会重复请求。
 */
export function App() {
  void refresh()

  const draft = createSignal("")
  const hasTodos = computed(() => todos.get().length > 0)

  const submit = (): void => {
    const title = draft.get().trim()
    if (!title) return
    draft.set("")
    void addTodo(title)
  }

  return (
    <main>
      <h1>kiko HMR · 全栈</h1>
      <p class="hint">
        保存 <code>src/app.tsx</code> / <code>src/counter.tsx</code>：客户端组件原位热替换，
        计数和已拉取的数据都保留。
        <br />
        保存 <code>src/store.ts</code>：模块级信号身份保留，当前数据不丢。
        <br />
        保存 <code>src/server/db.ts</code> / <code>src/server/api.ts</code>：<code>bun --hot</code>{" "}
        软重载服务端模块，<code>/hmr</code> 端点广播整页刷新——
        刷新后「求值时间」和种子数据就是新的。
      </p>

      <div class="meta">
        <div>
          status: <b>{status}</b>
        </div>
        <div>
          服务端运行时: <b>{runtime}</b>
        </div>
        <div>
          服务端求值时间: <b>{evaluatedAt}</b>
        </div>
      </div>

      <div class="row">
        <input
          value={draft}
          placeholder="新增待办，回车添加"
          onInput={event => draft.set((event.target as HTMLInputElement).value)}
          onKeyDown={event => {
            if (event.key === "Enter") submit()
          }}
        />
        <button onClick={submit}>添加</button>
      </div>

      <Show when={hasTodos} fallback={<p class="hint">暂无待办，先添加一条。</p>}>
        <ul class="todos">
          <For each={todos}>
            {todo => (
              <li class={todo.done ? "done" : ""}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => void toggleTodo(todo.id)}
                />
                <span>{todo.title}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Counter />
    </main>
  )
}
