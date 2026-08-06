---
name: kiko/store
description: >-
  细粒度响应式状态对象：createStore 用代理按路径为每个属性建 Signal.State，
  嵌套对象惰性包裹、链式访问；ref 阻止递归深入；.signal / .get() / .set()
  显式桥接。适合复杂表单、深层配置等需要按属性精准响应的状态。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/signals
---

# Store（@kikojs/signal）

`createStore` 把普通对象变成按属性响应式的 store：每层都是代理节点，为每个访问过的路径建一个 `Signal.State`，嵌套对象惰性包裹，链式访问深层属性。写入只触发被写路径（及向上传播的祖先）的 watcher。

## 创建与访问

```ts
import { createStore } from "@kikojs/signal"

const store = createStore({
  name: "Alice",
  user: { age: 30, role: "admin" },
  count: 0,
  tags: ["a", "b"],
})

// 显式信号式访问
store.name.get() // "Alice"
store.name.set("Bob") // 只触发 name 的 watcher

// 代理式读写（JSX/effect 里同样响应式）
store.user.role = "user"
store.count += 1

// 深层 + 数组
store.user.age.get() // 30
store.user.age.set(35) // 触发 user.age、user 的 watcher（向上传播）
store.tags.length // 数组长度信号
store.tags[0] // 下标访问
```

类型上，`Store<T>` 为每个属性展开为 `Store` 节点；数组带 `{ readonly length: Store<number> }` 与数字索引。类型按初始形状约束（运行时接受任意对象并自动包裹）。

## 显式桥接：.signal / .get() / .set()

每个路径节点都有三个显式接口：

```ts
store.user.age.signal // 该路径的底层 Signal.State（ref 之下为 undefined）
store.user.age.get() // 等价于 signal.get()
store.user.age.set(35) // 等价于 signal.set()
```

在 JSX 中把 `store.x.signal` 传给属性/子节点即自动订阅：

```tsx
<div>{store.name.signal}</div>
```

用 `computed` 派生只依赖所需路径的细粒度值：

```ts
import { computed } from "@kikojs/signal"
const decade = computed(() => Math.floor(store.user.age.get() / 10))
```

## 阻止递归：ref

`ref(value)` 包裹的值不会被代理——适合类实例、自引用结构、外部对象等非平凡值。整个节点作为普通值保留，仍在该节点响应式。

```ts
import { createStore, ref, isRef } from "@kikojs/signal"

class Clock {
  now = Date.now()
}
const store = createStore({ clock: ref(new Clock()) })

store.clock.get() instanceof Clock // true —— 原引用，未被代理
isRef(store.clock) // true
```

## 替换嵌套对象

`store.user.set({ ... })` 接受任意对象并自动包裹，新形状可链式访问（类型上仍按初始形状约束，需显式断言演示运行时行为）。

## 语义与陷阱

- **同值短路**：写入与当前值相等的值不触发通知。
- **符号键**：除 `Symbol.iterator` / `Symbol.asyncIterator` / `Symbol.toStringTag` 外，其余 symbol 键可用；运行时会拒绝上述三个遍历/字符串化协议键。
- **信号可见性**：`Signal.Computed` 订阅到的是路径信号（`get`/`.set`/`.signal`），不是「字段值」本身——所以同对象引用重排时，keyed `For` 的 index 必须做成 `Signal.State`（见 `kiko/control-flow`）。
- store 是纯状态容器，不含 `effect`/`computed` 定义（派生用 `@kikojs/signal` 的独立函数完成）。
