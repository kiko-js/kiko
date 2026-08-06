---
name: kiko/signals
description: >-
  kiko 的响应式核心：createSignal、computed/derived、effect（含批量、
  错误隔离、清理作用域）、batch、untrack、on 依赖辅助、onCleanup、
  createWatcher、toSignalValue、watchValue。处理「如何声明可变状态、
  如何派生、如何跑副作用」。
type: sub-skill
library: kiko
requires:
  - kiko
---

# Signals（@kikojs/signal）

所有信号都是标准 TC39 `Signal.State<T>` / `Signal.Computed<T>`（基于 signal-polyfill）。读取用 `.get()`，写入用 `.set()`。

## 可变状态：createSignal

```ts
import { createSignal } from "@kikojs/signal"

const count = createSignal(0) // Signal.State<number>
count.get() // 0
count.set(1)
count.set(v => v + 1) // 函数式写：基于当前值
```

## 派生：computed / derived

```ts
import { computed, derived } from "@kikojs/signal"

const double = computed(() => count.get() * 2) // Signal.Computed<number>
const alias = derived(() => count.get()) // derived 是 computed 的别名
```

`computed` 惰性求值、按依赖缓存；依赖不变时重复 `.get()` 不会重跑。

## 副作用：effect

```ts
import { effect } from "@kikojs/signal"

const stop = effect(() => {
  console.log("count =", count.get())
  // 返回函数即 cleanup：重跑前与 dispose 时执行
  return () => console.log("cleanup", count)
})

stop() // 手动停止并触发 cleanup
```

- 重跑是**微任务批量 + 去重**的：同一 flush 内多次信号写入只触发一次 effect。
- **错误隔离**：effect 抛错由宿主 `reportError` 接管，不阻断兄弟 effect 或后续重跑。
- 返回非函数（含 undefined）则不注册 cleanup。

## 批量与不订阅

```ts
import { batch, untrack } from "@kikojs/signal"

batch(() => {
  a.set(1)
  b.set(2) // 只触发一次 flush
})

// untrack：读取但不建立订阅
effect(() => {
  untrack(() => console.log(count.get()))
})
```

## 依赖辅助：on

`on(deps, fn, { defer? })` 只在 deps 变化时执行 fn，其余读取不订阅（SolidJS 风格）。

```ts
import { on } from "@kikojs/signal"

effect(on(count, v => console.log("changed to", v))) // 可选 defer: true 延迟首跑
```

## 清理作用域：onCleanup

在 effect 内调用，注册当前作用域的清理函数（随 effect dispose 执行，也用于 `createResource` 等在作用域内自动回收的场景）：

```ts
import { onCleanup } from "@kikojs/signal"

effect(() => {
  const sub = someExternal().subscribe(cb)
  onCleanup(() => sub.unsubscribe())
})
```

## 底层观察者：createWatcher

封装 `Signal.subtle.Watcher`：`watcher.watch(sig)` 加入观察、`unwatch(sig)` 移除，信号变化时回调触发。

```ts
import { createWatcher } from "@kikojs/signal"

const w = createWatcher(() => console.log("dirty"))
w.watch(count)
```

## 工具：toSignalValue / watchValue

```ts
import { toSignalValue, watchValue } from "@kikojs/signal"

toSignalValue(x) // x 是信号则 .get()，否则原样返回
watchValue(count, v => console.log("value:", v)) // 订阅变化，变化时回调
```

`watchValue` 是一次性 watcher，回调后重新武装，可安全用于变化驱动的副作用。

## 陷阱

- 在 effect/computed 之外读取信号不会建立依赖（无自动订阅，需自行用 `effect` 或 `watchValue`）。
- `batch` 内多次写仍按 flush 合并；需要立即生效的效果可自行在 batch 外写。
- 信号作为 JSX 子节点 / 属性直接传值即可自动绑定（见 `kiko/dom-rendering`），无需手动 `watchValue`。
