/** @jsxImportSource @kikojs/dom */
import { hydrate, createSignal, Show } from "@kikojs/dom"

// 服务端已用 renderToFragment / renderToDocument 产出 HTML 并内联到页面；
// 客户端用同一组件树水合：采纳现有 DOM，挂上事件与信号绑定，不重建。
const count = createSignal(1)

const dispose = hydrate(
  () => (
    <main>
      <p>{count}</p>
      <Show when={count.get() > 0}>visible</Show>
    </main>
  ),
  document.getElementById("app")!,
)

// 水合后信号照常驱动更新；dispose() 卸载并清理
count.set(2)
