# @kikojs/signal

基于 [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill)（TC39 Signals 提案 polyfill）的信号原语工具集。`createSignal` 返回标准的 `Signal.State<T>`，任何消费标准 TC39 Signals 接口的库都可以直接使用；`batch`、`untrack`、`on`、`createStore` 等辅助能力纯粹是增量扩展，不会改变信号本身的行为。

## 安装

```bash
bun add @kikojs/signal
# 或
npm install @kikojs/signal
```

## 快速开始

```ts
import { createSignal, computed, effect } from "@kikojs/signal"

const count = createSignal(0)
const doubled = computed(() => count.get() * 2)

effect(() => {
  console.log(`count = ${count.get()}, doubled = ${doubled.get()}`)
})

count.set(1) // count = 1, doubled = 2
```

## API

- **信号**：`createSignal`、`isSignal`、`createWatcher`
- **派生**：`computed` / `derived`、`toSignalValue`、`watchValue`
- **副作用**：`effect`（批处理、错误隔离、清理作用域）、`onCleanup`、`on`（显式依赖）
- **调度**：`batch`（合并写入）、`untrack`（不订阅读取）
- **Store**：`createStore`（代理式细粒度状态）、`ref` / `isRef` / `REF`
- **资源**：`createResource`（异步数据加载）
- **事件**：`createEmitter`（类型化事件管道）

## 文档

- 官网：<https://kiko-js.github.io/kiko/>
- 源码：<https://github.com/kiko-js/kiko>
