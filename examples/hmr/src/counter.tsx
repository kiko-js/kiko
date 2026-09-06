import { createSignal } from "@kikojs/dom"
import { sharedClicks } from "./store"

// Counter：组件内部信号在热替换后按创建序恢复旧值（count 不会归零）
export function Counter({ label }: { label: string }) {
  const count = createSignal(0)

  return (
    <div class="counter">
      <h2>
        {label} (shared clicks: {sharedClicks})
      </h2>
      <p>Count: {count}</p>
      <div class="actions">
        <button onClick={() => count.set(count.get() + 1)}>+1</button>
        <button onClick={() => count.set(0)}>Reset</button>
        <button onClick={() => sharedClicks.set(sharedClicks.get() + 1)}>Shared +1</button>
      </div>
    </div>
  )
}
