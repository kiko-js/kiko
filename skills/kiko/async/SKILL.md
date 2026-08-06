---
name: kiko/async
description: >-
  @kikojs/signal 的异步与事件工具：createResource 把异步拉取映射为
  data/loading/error 三信号，支持依赖驱动重拉与并发安全；createEmitter
  提供类型化事件总线（on/emit/off/hasListeners/clear）。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/signals
---

# Async（@kikojs/signal）

## createResource：异步数据

把一次（或依赖驱动的多次）异步拉取映射为三个信号，适合请求数据绑定到 UI。

```ts
import { createResource } from "@kikojs/signal"

const { data, loading, error, refetch, dispose } = createResource(
  async source => (await fetch(`/api?user=${source}`)).json(),
  { initial: null, source: () => userId.get() },
)

// data / loading / error 均为 Signal.State<T>
// JSX：<div>{data.signal}</div> 或 {data.get()}
```

行为：

- `source` 为 getter，其内读取的信号依赖变化时**自动重新拉取**；`fetcher(source)` 收到当前 source 值。
- **并发安全**：旧请求的迟到结果不会覆盖新请求（序号守卫）。
- `initial` 在首次加载完成前作为 `data` 的初值。
- `refetch()`：使用当前 source 值手动重拉。
- **生命周期**：在 effect 内创建时随作用域自动 `dispose`（内部 `onCleanup`）；在 effect 外（模块/组件顶层）需手动 `dispose()`，否则请求与监听泄漏。
- `dispose()` 后 `refetch()` 不生效（已短路）。

## createEmitter：类型化事件总线

```ts
import { createEmitter } from "@kikojs/signal"

const em = createEmitter<{ open: (id: number) => void }>()
const off = em.on("open", id => console.log("open", id))

em.emit("open", 1) // 触发 open 监听
off() // 移除该监听（幂等）
em.hasListeners("open") // boolean
em.clear() // 清空所有事件监听
```

- 事件名由泛型 `EventMap` 约束，`on`/`emit` 类型安全。
- `emit` 对监听者做快照，监听者在派发期间增删不影响本轮。
- 监听者抛错会向 `emit` 调用方传播（需自行 try/catch）。
- 适合作为轻量发布/订阅，不引入信号依赖。

## 在 JSX 中消费

三个包的信号都可直接放进 JSX：

```tsx
import { createResource, createSignal } from "@kikojs/signal"

function App() {
  const { data, loading, error } = createResource(() => fetchUsers().then(r => r.json()))
  return (
    <div>
      {loading} // 信号 → 文本节点（true/false 会 toString）
      {error && <p>出错了</p>} // 直接布尔运算
      <ul>{data && data.map(u => <li>{u.name}</li>)}</ul>
    </div>
  )
}
```

更结构化的条件/列表渲染用 `Show`/`For`（见 `kiko/control-flow`）。
