/** @jsxImportSource @kikojs/dom */
import { createSignal, For, Show, Suspend, lazy } from "@kikojs/dom"
import { computed } from "@kikojs/signal"
import { renderToPage } from "@kikojs/dom/server"

const count = createSignal(3)
// Show 的 when 为信号时订阅更新；SSR 取快照，hydrate 后按同一信号响应
const visible = computed(() => count.get() > 0)

// 懒加载模块（真实工程：() => import("./Card").then(m => m.default)）
const Card = lazy(() => Promise.resolve(() => <div class="card">card</div>))

async function render(): Promise<void> {
  // 整页一句话：渲染 HTML + 信号状态脚本块（直接拼进骨架）。
  // renderToFragment 是底层原语（任意子树、不带状态），只需要片段时用它。
  const { html, stateScript } = await renderToPage(() => (
    <main>
      <p>{count}</p>
      <Show when={visible} fallback="empty">
        <For each={["a", "b"]}>{item => <li>{item}</li>}</For>
      </Show>
      <Suspend fallback={<p>加载中…</p>}>
        <Card />
      </Suspend>
    </main>
  ))

  console.log(html, stateScript)
}
