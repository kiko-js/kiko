/** @jsxImportSource @kikojs/dom */
import { createSignal, hydrate, Show } from "@kikojs/dom"
import { computed } from "@kikojs/signal"
// 服务端已用 renderToFragment / renderToDocument 产出 HTML 并内联到页面；
// 客户端用同一组件树水合：采纳现有 DOM，挂上事件与信号绑定，不重建。
const count = createSignal(1)
// Show 的 when 需为信号（或 computed 派生），否则为一次性快照，更新不会响应
const visible = computed(() => count.get() > 0)

const dispose = hydrate(
  () => (
    <main>
      <p>{count}</p>
      <Show when={visible}>visible</Show>
    </main>
  ),
  document.getElementById("app")!,
)

// 水合后信号照常驱动更新；dispose() 卸载并清理
count.set(2)
