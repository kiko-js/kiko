/** @jsxImportSource @kikojs/dom */
import { computed, createSignal } from "@kikojs/signal"

/** 首页：signal 可写状态 + computed 派生状态，演示细粒度更新。 */
export function HomePage() {
  const count = createSignal(0)
  const doubled = computed(() => count.get() * 2)

  return (
    <section>
      <h1>首页</h1>
      <p>
        这是用 <code>@kikojs/dom</code> + <code>@kikojs/signal</code> + <code>@kikojs/router</code>{" "}
        搭出来的单页应用。
      </p>
      <div class="counter">
        <button onClick={() => count.set(count.get() - 1)}>−</button>
        <span>{count}</span>
        <button onClick={() => count.set(count.get() + 1)}>+</button>
      </div>
      <p class="muted">
        count 的两倍：<strong>{doubled}</strong>
        ——组件函数不会重新执行，只有这两个文本节点随 signal 更新。
      </p>
    </section>
  )
}
