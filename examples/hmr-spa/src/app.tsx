/** @jsxImportSource @kikojs/dom */
import { Counter } from "./counter"
import { doubled, sharedClicks } from "./store"

/**
 * 顶层组件：被插件改写为注册表包装（`__kiko_hmr.ref(...)`）。
 * 保存本文件后组件用新实现重跑，子组件实例按创建序认领，状态不丢。
 */
export function App() {
  return (
    <main>
      <h1>kiko HMR · 纯前端 SPA</h1>
      <p class="hint">
        保存 <code>src/counter.tsx</code>：组件原位热替换，两个计数器的计数都保留。
        <br />
        保存 <code>src/store.ts</code>：模块级信号按「模块 + 创建序」复用，值和身份都不丢。
        <br />
        保存 <code>src/app.tsx</code>：顶层组件重跑，子组件实例按创建序认领，状态仍在。
      </p>
      <p>
        模块级信号 sharedClicks = <b>{sharedClicks}</b>，computed doubled = <b>{doubled}</b>
      </p>
      <div class="counters">
        <Counter label="Counter A" />
        <Counter label="Counter B" />
      </div>
    </main>
  )
}
