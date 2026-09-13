---
name: kiko/store
description: >-
  细粒度响应式状态对象：createStore 用代理按路径为每个属性建 Signal.State，
  嵌套对象惰性包裹、链式访问。读取用 .get()（返回 deepFreeze 只读快照）或用
  可调用节点，写入只能用 .set()（代理赋值会抛错）；ref 阻止递归深入；
  .signal 用于 JSX 桥接（ref 之下为 undefined）；STORE_RAW 为逃生通道。
  适合复杂表单、深层配置等需要按属性精准响应的状态。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/signals
---

# Store（@kikojs/signal）

`createStore` 把普通对象变成按属性响应式的 store：每层都是代理节点，为每个访问过的路径建一个 `Signal.State`，嵌套对象惰性包裹，链式访问深层属性。写入只触发被写路径及其祖先/子孙的 watcher。

## 创建、读取与写入

```tsx
import { createStore, computed } from "@kikojs/signal"

const store = createStore({
  name: "Alice",
  user: { age: 30, role: "admin" },
  count: 0,
  tags: ["a", "b"],
})

// 读取（被追踪，可放进 computed/effect）：.get() 返回当前值
store.name.get() // "Alice"
store.user.role.get() // "admin"

// 写入必须用 .set()：只触发该路径 + 祖先/子孙的 watcher
store.name.set("Bob")
store.user.age.set(35) // age 与 user 的 watcher 都触发
store.count.set(store.count.get() + 1) // 注意：store 的 set 不支持函数式更新，需自行读旧值

// 可调用节点：store() 等价 store.get()
store.user.age() // 35

// JSX 桥接：把 .signal 传给子节点/属性即自动订阅
const user = (
  <div>
    {store.name.signal} / {store.user.role.signal}
  </div>
)

// 细粒度派生
const decade = computed(() => Math.floor(store.user.age.get() / 10))
```

## 显式桥接：.signal / .get() / .set()

每个路径节点都有三个显式接口：

```ts
store.user.age.signal // 该路径的底层 Signal.State（ref / 非普通对象之下为 undefined）
store.user.age.get() // 等价 signal.get()
store.user.age.set(35) // 等价 signal.set()；signal.set() 同样会写回 store 根
```

类型上，`Store<T>` 为每个属性展开为 `Store` 节点；数组带 `{ readonly length: Store<number> }` 与数字索引。类型按初始形状约束（运行时接受任意对象并自动包裹）。

## 阻止递归：ref

`ref(value)` 包裹的值不会被代理——适合类实例、自引用结构、外部对象。ref 是**终结点**：其下所有读取都返回原始值、**不建立响应式追踪**，`.signal` 为 `undefined`，`.set()` 是静默 no-op。

```ts
import { createStore, ref, isRef } from "@kikojs/signal"

class Clock {
  now = Date.now()
}
const store = createStore({ clock: ref(new Clock()) })

store.clock.get() instanceof Clock // true —— 原引用，未被代理
isRef(store.clock) // true
```

Date / Map / class 实例等非普通对象同样是 opaque terminal：整段不追踪。

## 替换嵌套对象与逃生通道

```ts
store.user.set({ name: "Carol", age: 28, role: "user" } as never) // 自动包裹新对象
```

数据键与 store API（`get`/`set`/`signal`）撞名时，用 `STORE_RAW` 读原始根：

```ts
import { STORE_RAW } from "@kikojs/signal"
store[STORE_RAW] // 原始对象（每个节点都可达）
```

## 语义与陷阱

- **写入只能用 `.set()`**：代理的 `set` trap 永远返回 `false`，`store.x = v` 在严格模式（ESM）下抛 `TypeError`。
- **`.get()` 返回 deepFreeze 只读快照**：对普通对象/数组递归 `Object.freeze`（缓存，无克隆）。要修改只能走 `.set()`。
- **同值短路**：写入与当前值 `Object.is` 相等时不触发任何通知。
- **数组 `length`**：`store.arr.length.get()` 可追踪，但 `store.arr.length.set(n)` 不会截断数组（会把 `"length"` 当数字解析为 `NaN`）——要改长度请整体 `store.arr.set(nextArray)`。
- **方法式访问**：普通对象/数组上的原生函数会绑定实时值，如 `store.items.map(fn)` 操作当前数组，而不是游离代理节点。
- **符号键**：数据 symbol 键正常；`Symbol.iterator` / `Symbol.asyncIterator` / `Symbol.toStringTag` 及 `then`/`catch`/`finally` 一律返回 `undefined`（防止 `await store` 挂起）。
- **信号可见性**：`Signal.Computed` 订阅到的是路径信号；keyed `For` 的 index 因此做成 `Signal.State`（见 `kiko/control-flow`）。
- store 是纯状态容器，不含 `effect`/`computed` 定义（派生用独立函数完成）。
