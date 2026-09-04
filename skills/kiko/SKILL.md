---
name: kiko
description: >-
  kiko 是一个构建于 signal-polyfill（TC39 Signals）之上的细粒度响应式 DOM 库：
  无虚拟 DOM、无 diff，JSX 编译为真实 DOM 节点，信号变化精准更新对应节点。
  提供 @kikojs/signal（信号原语 / store / resource / emitter）、@kikojs/dom
  （JSX 工厂 / 渲染 / 控制流 / SSR 与水合）、@kikojs/router（路由 / 守卫 / 组件）。
  本技能是所有 kiko 技能的入口，先读本文件，再按需进入子技能。
type: core
library: kiko
library_version: monorepo (packages/signal, packages/dom, packages/router)
---

# Kiko

kiko 把响应式状态（signal）直接绑到真实 DOM 节点上：没有虚拟 DOM 与协调过程，组件函数只执行一次，信号变化时只更新被读取到的那个节点。三个包共同构成使用面：

| 包               | 入口                                                           | 作用                                                                                                                                   |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikojs/signal` | `import { … } from "@kikojs/signal"`                           | `createSignal` / `computed` / `effect` / `batch` / `untrack` / `on` / `onCleanup` / `createStore` / `createResource` / `createEmitter` |
| `@kikojs/dom`    | `@kikojs/dom`、`@kikojs/dom/jsx-runtime`、`@kikojs/dom/server` | JSX 工厂 `jsx`、`render` / `hydrate`、控制流 `Show`/`For`/`ErrorBoundary`/`Suspend`、`lazy`、`Style`、`createPortal`、SSR 入口         |
| `@kikojs/router` | `import { … } from "@kikojs/router"`                           | `createRouter`、`Router`/`Route`/`Link`/`Outlet`/`Navigate`、hooks、守卫                                                               |

`@kikojs/dom` **不依赖** `@kikojs/signal`——它自带一份薄薄的 signal-polyfill 封装。信号统一为标准 TC39 `Signal.State` / `Signal.Computed`，任何消费该接口的库都可直接使用。

## 安装与 JSX 配置

```bash
bun add @kikojs/signal @kikojs/dom
```

TSX 文件顶部加 pragma（或项目 tsconfig 设 `jsxImportSource`）：

```tsx
/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/signal"
import { render } from "@kikojs/dom"

const count = createSignal(0)
const app = <button onClick={() => count.set(count.get() + 1)}>{count}</button>

render(app, document.getElementById("app")!)
```

`{count}` 直接把 `Signal.State` 放进子节点：kiko 为这个绑定建 watcher，信号变化只更新该文本节点。

## Sub-Skills

| 任务                                                                                                     | 子技能               |
| -------------------------------------------------------------------------------------------------------- | -------------------- |
| 信号基础：createSignal / computed / effect / batch / untrack / on / onCleanup / watchValue / on 依赖辅助 | `kiko/signals`       |
| 细粒度响应式对象：createStore / ref / 代理读写 / .signal 桥接                                            | `kiko/store`         |
| 异步与事件：createResource / createEmitter                                                               | `kiko/async`         |
| JSX 渲染：jsx 工厂 / render / hydrate / createPortal / ref / Style                                       | `kiko/dom-rendering` |
| 控制流：Show / For / ErrorBoundary / Suspend / lazy                                                      | `kiko/control-flow`  |
| SSR 与水合：@kikojs/dom/server / renderToFragment / renderToStream                                       | `kiko/ssr`           |
| 路由：createRouter / Router / Link / Outlet / hooks / 守卫                                               | `kiko/router`        |

## Quick Decision Tree

```
需要响应式状态（变量、派生、副作用、批量、依赖辅助）？
  → kiko/signals

需要一个深层嵌套、按属性响应式的状态对象？
  → kiko/store

需要异步拉取数据（loading/error/data）或类型化事件总线？
  → kiko/async

需要把 JSX 挂到 DOM、处理属性/事件/ref、门户、样式？
  → kiko/dom-rendering

需要条件渲染、列表、错误边界、异步组件/懒加载？
  → kiko/control-flow

需要服务端渲染字符串 + 客户端水合？
  → kiko/ssr

需要声明式路由 / 导航 / 守卫 / URL 状态？
  → kiko/router
```

## 跨包关键概念

- **组件只执行一次**：无 re-render 循环。`function App() { return <div>{x}</div> }` 只跑一次，响应式来自信号绑定，不是重跑函数。
- **信号在 props/children 中的绑定**：在 JSX 里读到的每个信号都按「读取点」建一个 `Signal.subtle.Watcher`。文本/属性/事件按值更新；若信号值解析为 `Node` 或数组，则用标记锚点整棵替换子树（结构响应式）。
- **`Signal.State` 是标准接口**：`s.get()` 读、`s.set(v)` 写（也接受 `v => v+1` 函数式写）；`computed(fn)` 返回 `Signal.Computed`。
- **`render()` 返回 `dispose`**：整体卸载时清理所有 watcher、事件监听与 `ref` 清理回调。重复挂载到同一容器会先拆除旧树。

## 约束与陷阱

- `@kikojs/signal` 的 `store` 只含 store 逻辑，`effect`/`computed` 在独立文件（实现细节，用户只需知道 store 可安全嵌套）。
- store 同值写入短路；`Signal.Computed` 订阅不到「普通字段值」变化——这是 keyed `For` 的 index 做成 `Signal.State` 的原因（见 `kiko/control-flow`）。
- `<style>` 内联元素就是 `Style` 组件（默认作用域 CSS，`<style global>` 全局），见 `kiko/dom-rendering`。
- `@kikojs/dom/server` 的渲染函数接收 **thunk**：`renderToFragment(() => <App/>)`，不是节点本身。
- `Router`/`Link` 的 **path/hash history 是客户端专用**（读取 `window`）。SSR 用
  `createMemoryHistory` + `withSSRRouter`（`@kikojs/router/server`）做字符串渲染，
  渲染前 `await router.ready`（初始守卫/重定向落定）；路由树水合已支持
  （`hydrate` 直接对 SSR 产物采纳，见 `kiko/router`）。

## 参考实现

monorepo 含完整示例与文档：

- `examples/basic`、`examples/htm`、`examples/react-portal`、`examples/tailwind`、`examples/ssr`（全栈 SSR + 水合）
- `docs/` 静态文档站（`signal.html` / `dom.html` / `router.html` / `examples.html` / `api.html`），构建：`bun run docs/build.ts`
