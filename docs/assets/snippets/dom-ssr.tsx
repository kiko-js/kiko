/** @jsxImportSource @kikojs/dom */
import { createSignal, renderToDocument, renderToFragment, Show, For, Suspend, lazy } from "@kikojs/dom"

const count = createSignal(3)

// 懒加载模块（真实工程：() => import("./Card").then(m => m.default)）
const Card = lazy(() => Promise.resolve(() => <div class="card">card</div>))

async function render(): Promise<void> {
  // 片段：任意子树，不带 doctype。信号取当前快照，Suspend 会等待 promise 后再输出
  const fragment = await renderToFragment(() => (
    <main>
      <p>{count}</p>
      <Show when={count.get() > 0} fallback="empty">
        <For each={["a", "b"]}>{item => <li>{item}</li>}</For>
      </Show>
      <Suspend fallback={<p>加载中…</p>}>
        <Card />
      </Suspend>
    </main>
  ))

  // 完整文档：根为 <html>，自动前置 <!DOCTYPE html>
  const page = await renderToDocument(() => (
    <html lang="zh-CN">
      <head>
        <title>kiko</title>
      </head>
      <body>hello</body>
    </html>
  ))
}
