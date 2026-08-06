/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/dom"

// lazy 加载的模块：SSR 时服务端渲染出初始内容，水合后客户端模块接管，
// 信号与事件绑定在此生效。
export default function ClockCard() {
  const clicks = createSignal(0)
  return (
    <div class="card">
      <p>
        来自 lazy 模块的卡片 —— 水合后点击计数 <strong>{clicks}</strong>
      </p>
      <button onClick={() => clicks.set(clicks.get() + 1)}>lazy +1</button>
    </div>
  )
}
