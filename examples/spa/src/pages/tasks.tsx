/** @jsxImportSource @kikojs/dom */
import { For, Show } from "@kikojs/dom"
import { computed, createSignal } from "@kikojs/signal"
import { addTask, remaining, removeTask, tasks, toggleTask } from "../store"

/** 任务页：Show 条件渲染 + For 列表渲染 + 模块级 signal 状态。 */
export function TasksPage() {
  const draft = createSignal("")
  const hasTasks = computed(() => tasks.get().length > 0)

  const submit = (): void => {
    addTask(draft.get())
    draft.set("")
  }

  return (
    <section>
      <h1>任务</h1>
      <p class="muted">状态放在模块级 signal 里，跨路由共享，无需 Provider。</p>
      <div class="row">
        <input
          value={draft}
          placeholder="输入任务，回车添加"
          onInput={event => draft.set((event.target as HTMLInputElement).value)}
          onKeyDown={event => {
            if (event.key === "Enter") submit()
          }}
        />
        <button onClick={submit}>添加</button>
      </div>
      {/* when 传 signal：条件变化时整块分支替换；fallback 不执行 */}
      <Show when={hasTasks} fallback={<p class="muted">暂无任务，先添加一条。</p>}>
        <ul class="tasks">
          <For each={tasks}>
            {task => (
              <li class={task.done ? "done" : ""}>
                <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} />
                <span>{task.title}</span>
                <button onClick={() => removeTask(task.id)}>删除</button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <p class="muted">剩余 {remaining} 项</p>
    </section>
  )
}
