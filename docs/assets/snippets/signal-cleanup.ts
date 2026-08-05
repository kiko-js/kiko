import { createSignal, effect, onCleanup } from "@kikojs/signal"

const query = createSignal("kiko")

effect(() => {
  // 每次重跑都会创建新的请求
  const controller = new AbortController()
  fetch(`/api/search?q=${query.get()}`, { signal: controller.signal })

  // 重跑前与 dispose 时执行，清理上一次运行留下的资源
  onCleanup(() => controller.abort())
})

query.set("dom") // 先 abort 旧请求，再发起新请求
