/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/dom"
import { sharedClicks } from "./store"

/**
 * 组件内部信号：HMR 重跑组件时按创建序 + 类型指纹恢复旧值——保存本文件后
 * 计数不会归零。
 */
export function Counter({ label }: { label: string }) {
  const count = createSignal(0)

  return (
    <section class="counter">
      <h2>{label}</h2>
      <p>
        Count: <b>{count}</b>
      </p>
      <div class="actions">
        <button onClick={() => count.set(count.get() + 1)}>+1</button>
        <button onClick={() => count.set(0)}>Reset</button>
        <button onClick={() => sharedClicks.set(sharedClicks.get() + 1)}>Shared +1</button>
      </div>
    </section>
  )
}
