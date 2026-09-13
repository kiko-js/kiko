---
name: kiko/signals
description: >-
  kiko 的响应式核心：createSignal、computed（只读、禁止内部写信号）、
  effect（微任务批量、错误隔离、可嵌套、清理作用域）、batch、untrack、
  on 依赖辅助、onCleanup、watchValue / toSignalValue / createWatcher。
  处理「如何声明可变状态、如何派生、如何跑副作用」。
type: sub-skill
library: kiko
requires:
  - kiko
---

# Signals（@kikojs/signal）

所有信号都是标准 TC39 `Signal.State<T>` / `Signal.Computed<T>`（基于 signal-polyfill）。读取用 `.get()`，写入用 `.set()`。

## 可变状态：createSignal / isSignal

```ts
import { createSignal, isSignal } from "@kikojs/signal"

const count = createSignal(0) // Signal.State<number>
count.get() // 0
count.set(1)
count.set(v => v + 1) // 函数式写：基于当前值

isSignal(count) // true；同时识别 State 与 Computed（鸭子类型，跨库副本也可识别）
```

## 派生：computed

```ts
import { computed } from "@kikojs/signal"

const double = computed(() => count.get() * 2) // Signal.Computed<number>
```

- 惰性、按依赖缓存；依赖不变时重复 `.get()` 不重跑。
- **只读**：在 `computed` 函数体内调用 `set()` 会抛 `Error("Signal writes are not allowed inside a computed")`。
- `derived` **已移除**（旧别名不再导出），一律用 `computed`。

## 副作用：effect

```ts
import { effect } from "@kikojs/signal"

const stop = effect(() => {
  console.log("count =", count.get())
  return () => console.log("cleanup") // 返回函数即 cleanup，重跑前与 dispose 时执行
})
stop() // 幂等停止
```

- 创建时**同步执行一次**；重跑是微任务批量 + 去重的：同一 flush 内多次写入只触发一次。
- **错误隔离**：`fn` 抛错经宿主 `reportError` 上报，不阻断兄弟 effect 或后续重跑。
- **清理**：返回式 cleanup 与 `onCleanup` 注册项在同一 scope 中按注册逆序执行；cleanup 在 `untrack` 内运行（其中的读取不成为依赖）；单个 cleanup 抛错被吞掉。
- **嵌套 effect 归外层所有**：外层 effect 重跑 / dispose 时，自动 dispose 其上次运行中创建的内层 effect。

## 批量与不订阅

```ts
import { batch, untrack } from "@kikojs/signal"

batch(() => {
  a.set(1)
  b.set(2) // 只触发一次 flush
})

effect(() => {
  untrack(() => console.log(count.get())) // 读取但不建立依赖
})
```

`batch` 只推迟 effect 运行，不冻结 signal 值；嵌套安全，最外层退出时才 flush。

## 依赖辅助：on

`on(deps, fn, { defer? })` 只在 deps 变化时执行 fn，fn 内的其他读取不订阅（SolidJS 风格）。deps 是 getter 或 getter 数组；fn 收到上一次依赖值（首次为 `undefined`）。

```ts
effect(
  on(
    () => source.get(),
    prev => console.log("prev:", prev, "now:", source.get()),
  ),
)
effect(on([() => a.get(), () => b.get()], prev => console.log(prev), { defer: true }))
```

## 清理作用域：onCleanup

在 effect 内调用，注册当前作用域的清理函数；在 effect 外（含 `computed` 内）调用是 **no-op**。

```ts
effect(() => {
  const sub = someExternal().subscribe(cb)
  onCleanup(() => sub.unsubscribe())
})
```

## 工具：watchValue / toSignalValue

```ts
import { toSignalValue, watchValue } from "@kikojs/signal"

toSignalValue(x) // x 是信号则 .get()（会建立依赖追踪），否则原样返回

const watcher = watchValue(count, v => console.log("value:", v)) // 变化时回调（微任务）
watcher?.unwatch(count) // 手动停止；普通值则立即回调一次并返回 null
```

`watchValue` 内部按需重新武装，回调抛错经 `reportError` 上报后仍会 re-arm。

## 底层观察者：createWatcher

`createWatcher(cb)` 封装 `Signal.subtle.Watcher`：`watcher.watch(sig)` 添加、`unwatch(sig)` 移除。注意 polyfill 的 watcher 是**一次性**的——回调触发后需自行重新 `watch`；且回调在通知阶段同步触发，回调内直接读信号会抛 "signal read during notification phase"（用 `watchValue` 或 `queueMicrotask` 规避）。

```ts
const w = createWatcher(() => console.log("dirty"))
w.watch(count)
```

## 陷阱

- 在 effect/computed 之外读取信号不会建立依赖；组件体只执行一次，`.get()` 出现在组件体顶层只是一次快照。
- 信号作为 JSX 子节点 / 属性直接传值即可自动绑定（见 `kiko/dom-rendering`），无需手动 `watchValue`。
- `onCleanup` 与 `computed` 内的清理互不干扰：`computed` 内部会清空作用域，避免清理泄漏到外层 effect。
