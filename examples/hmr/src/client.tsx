import { render } from "@kikojs/dom"
import { doubled } from "./store"
import { Counter } from "./counter"

function App() {
  return (
    <main>
      <h1>Kiko HMR</h1>
      <p class="hint">
        编辑 src/counter.tsx —— 组件热替换，count 状态保留；编辑 src/store.ts ——
        模块信号身份保留；编辑本文件 —— 入口重渲染 + 实例认领。
      </p>
      <p>
        Doubled (module signal): <b>{doubled}</b>
      </p>
      <Counter label="Counter A" />
      <Counter label="Counter B" />
    </main>
  )
}

render(<App />, document.getElementById("app")!)
