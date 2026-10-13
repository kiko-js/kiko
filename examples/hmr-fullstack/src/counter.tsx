/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/dom"

/**
 * 组件内部信号：HMR 重跑组件时按创建序 + 类型指纹恢复旧值。保存本文件后，
 * 这个计数不会归零——客户端状态保留的最小可验证例子。
 */
export function Counter() {
  const count = createSignal(0)

  return (
    <section class="counter">
      <h2>客户端组件状态</h2>
      <p>
        Count: <b>{count}</b>（保存 src/counter.tsx，这个数字保持不变）
      </p>
      <div class="actions">
        <button onClick={() => count.set(count.get() + 1)}>+1</button>
        <button onClick={() => count.set(0)}>Reset</button>
      </div>
    </section>
  )
}
