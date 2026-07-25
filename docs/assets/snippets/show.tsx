import { Show, createSignal } from "@kikojs/dom"

const ready = createSignal(false)

<Show
  when={ready}
  fallback={<p>加载中…</p>}
>
  {() => <p>内容已就绪</p>}
</Show>

setTimeout(() => ready.set(true), 1000)
