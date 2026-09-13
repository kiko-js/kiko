---
name: kiko/async
description: >-
  @kikojs/signal 的异步与事件工具：createResource 把异步拉取映射为
  data/loading/error 三个标准 Signal.State，支持依赖驱动重拉与并发安全；
  createEmitter 提供类型化事件总线（on/once/off/emit/hasListeners/clear）。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/signals
---

# Async（@kikojs/signal）

## createResource：异步数据

把一次（或依赖驱动的多次）异步拉取映射为三个信号，返回 `{ data, loading, error, refetch, dispose }`。

```ts
import { createResource, createSignal } from "@kikojs/signal"

const userId = createSignal(1)

const user = createResource(async (id: number) => (await fetch(`/api/users/${id}`)).json(), {
  initial: null,
  source: () => userId.get(),
})

// data / loading / error 本身就是 Signal.State（没有 .signal 子对象）
user.data.get() // 当前数据（加载中为 initial / undefined）
user.loading.get() // 是否有请求在途
user.error.get() // 最近一次错误；无错误为 null
user.refetch() // 用当前 source 值手动重拉
user.dispose() // 停止监听与在途请求
```

行为：

- `source` 为 getter，其内读取的信号依赖变化时**自动重新拉取**；`fetcher(source)` 收到当前 source 值。
- **并发安全**：序号守卫保证旧请求的迟到结果不会覆盖新请求；`source` 抛错进入 `error` 态并结束 loading。
- **生命周期**：在 effect 内创建时随作用域自动 `dispose`（组件是单次执行，通常需手动管理）；在组件/模块顶层创建需手动 `dispose()`，否则请求与监听泄漏。
- `dispose()` 幂等，会把 `loading` 复位为 `false`；dispose 后 `refetch()` 不生效。

## createEmitter：类型化事件总线

```ts
import { createEmitter } from "@kikojs/signal"

// 事件名 → 载荷类型（不是函数签名）
const em = createEmitter<{ open: number; close: void }>()
const off = em.on("open", id => console.log("open", id)) // id: number
em.once("open", id => console.log("once", id))

em.emit("open", 1)
off() // 移除该监听（幂等）
em.hasListeners("open") // 事件名可省略：是否有任意监听
em.clear() // 也可只清某个事件：em.clear("open")
```

- 事件名由泛型 `EventMap` 约束，`on`/`emit` 类型安全；`once` 只触发一次（需用其返回的函数取消，`off` 传原 listener 无法移除）。
- `emit` 对监听者做快照，监听者在派发期间增删不影响本轮；无监听时 no-op。
- 监听者抛错会**直接向 `emit` 调用方传播**（需自行 try/catch）。
- 适合轻量发布/订阅，不引入信号依赖。

## 在 JSX 中消费

三个状态信号可直接交给 `Show`/`For` 或放进 JSX：

```tsx
/** @jsxImportSource @kikojs/dom */
import { createResource } from "@kikojs/signal"
import { Show, For } from "@kikojs/dom"

function UserList() {
  const { data, loading, error } = createResource(() => fetchUsers())

  return (
    <div>
      {loading} {/* 布尔信号直接绑定 → 文本节点 */}
      <Show when={error}>{e => <p>出错了: {String(e)}</p>}</Show>
      <Show when={data}>{list => <For each={list}>{u => <li>{u.name}</li>}</For>}</Show>
    </div>
  )
}
```

更结构化的条件/列表渲染见 `kiko/control-flow`。
