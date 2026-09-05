import { createSignal } from "@kikojs/dom"

/** 首页 / 示例页共用的实时计数器 demo。组件函数只执行一次。 */
export function Counter() {
  const count = createSignal(0)
  return (
    <div class="counter">
      <button onClick={() => count.set(count.get() - 1)}>−</button>
      <span>{count}</span>
      <button onClick={() => count.set(count.get() + 1)}>+</button>
    </div>
  )
}
