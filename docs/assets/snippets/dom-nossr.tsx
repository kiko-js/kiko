/** @jsxImportSource @kikojs/dom */
import { NoSSR, Show, For, createSignal } from "@kikojs/dom"
import { computed } from "@kikojs/signal"
import { renderToPage } from "@kikojs/dom/server"

// 时间线页面：头部/页脚静态直出；时间线数据只存在客户端（登录后 fetch），
// SSR 阶段连 children 函数都不执行——无 fetch、无 window 访问、不占信号槽位。
// 水合先采纳骨架屏，微任务填充真实内容；数据到达后 Show/For 响应式渲染。
function Timeline() {
  const items = createSignal<string[]>([])
  const ready = computed(() => items.get().length > 0)
  // 真实工程：fetch("/api/timeline").then(r => r.json()).then(v => items.set(v))
  setTimeout(() => items.set(["第一条动态", "第二条动态"]), 500)
  return (
    <Show when={ready} fallback={<li>加载中…</li>}>
      <For each={items}>{item => <li>{item}</li>}</For>
    </Show>
  )
}

async function render(): Promise<void> {
  const { html, stateScript } = await renderToPage(() => (
    <main>
      <header>我的时间线</header>
      <NoSSR fallback={<ul><li class="skeleton">骨架屏…</li></ul>}>
        {() => <Timeline />}
      </NoSSR>
      <footer>© 2026</footer>
    </main>
  ))

  console.log(html, stateScript)
}
