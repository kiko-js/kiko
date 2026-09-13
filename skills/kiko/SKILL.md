---
name: kiko
description: >-
  kiko 是一个构建于 signal-polyfill（TC39 Signals）之上的细粒度响应式 DOM 库：
  无虚拟 DOM、无 diff，JSX 编译为真实 DOM 节点，组件函数只执行一次（惰性物化），
  信号变化只更新被读取到的节点。提供 @kikojs/signal（信号 / store / resource / emitter）、
  @kikojs/dom（JSX / 渲染 / 控制流 / SSR 与水合）、@kikojs/router（路由 / 守卫）、
  @kikojs/hmr（独立 /hmr 端点 + Bun/Node 接入的热更新）。
  本技能是所有 kiko 技能的入口，先读本文件，再按需进入子技能。
type: core
library: kiko
library_version: monorepo (packages/signal, packages/dom, packages/router, packages/hmr)
---

# Kiko

kiko 把响应式状态（signal）直接绑到真实 DOM 节点上：没有虚拟 DOM 与协调过程，组件函数只执行一次，信号变化时只更新被读取到的那个节点。四个包共同构成使用面：

| 包               | 入口                                                                           | 作用                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kikojs/signal` | `@kikojs/signal`                                                               | `createSignal` / `computed` / `effect` / `batch` / `untrack` / `on` / `onCleanup` / `watchValue` / `createStore` / `ref` / `createResource` / `createEmitter` / `createWatcher` |
| `@kikojs/dom`    | `@kikojs/dom`、`/server`、`/hmr`、`/hydrate`、`/jsx-runtime`、`/react-portal`  | JSX 工厂、`render` / `hydrate`、控制流 `Show`/`For`/`ErrorBoundary`/`Suspend`/`NoSSR`、`lazy`/`realize`、`Style`、`createPortal`、`ReactPortal`、SSR 入口                       |
| `@kikojs/router` | `@kikojs/router`、`/server`                                                    | `createRouter`、`Router`/`Link`/`Outlet`/`Navigate`、hooks、守卫、`withSSRRouter`                                                                                               |
| `@kikojs/hmr`    | `@kikojs/hmr`、`/client`、`/server`、`/transform`、`/watcher`、`/bun`、`/node` | HMR 运行时 + 独立 `/hmr` 端点（SSE / WebSocket，纯 Fetch API）+ 通用改写 / watcher + Bun 与 Node 两个接入入口（`@kikojs/dom/hmr` 为 DOM 接线层）                                |

`@kikojs/dom` **不依赖** `@kikojs/signal`——它自带一份薄薄的 signal-polyfill 封装（只导出 `createSignal` / `isSignal` / `createWatcher`）。信号统一为标准 TC39 `Signal.State` / `Signal.Computed`，任何消费该接口的库都可直接使用。

## 安装与 JSX 配置

```bash
bun add @kikojs/signal @kikojs/dom
```

TSX 文件顶部加 pragma（或项目 tsconfig 设 `jsxImportSource`）：

```tsx
/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/dom"
import { render } from "@kikojs/dom"

const count = createSignal(0)
const app = <button onClick={() => count.set(count.get() + 1)}>{count}</button>

render(app, document.getElementById("app")!)
```

`{count}` 直接把 `Signal.State` 放进子节点：kiko 为这个绑定建 watcher，信号变化只更新该文本节点。

## Sub-Skills

| 任务                                                                                                       | 子技能               |
| ---------------------------------------------------------------------------------------------------------- | -------------------- |
| 信号基础：createSignal / computed / effect / batch / untrack / on / onCleanup / watchValue / createWatcher | `kiko/signals`       |
| 细粒度响应式对象：createStore / ref / 代理读写 / .signal 桥接                                              | `kiko/store`         |
| 异步与事件：createResource / createEmitter                                                                 | `kiko/async`         |
| JSX 渲染：jsx 工厂 / render / hydrate / createPortal / ReactPortal / ref / Style / children 检查           | `kiko/dom-rendering` |
| 控制流：Show / For / ErrorBoundary / Suspend / NoSSR / lazy                                                | `kiko/control-flow`  |
| SSR 与水合：@kikojs/dom/server / renderToPage / renderToStream / withSSRScope                              | `kiko/ssr`           |
| 路由：createRouter / Router / Link / Outlet / hooks / 守卫 / keepAlive                                     | `kiko/router`        |
| 热更新：@kikojs/hmr / 独立端点 / Bun 与 Node 接入 / 状态保留                                               | `kiko/hmr`           |

## Quick Decision Tree

```
需要响应式状态（变量、派生、副作用、批量、依赖辅助）？
  → kiko/signals

需要一个深层嵌套、按属性响应式的状态对象？
  → kiko/store

需要异步拉取数据（loading/error/data）或类型化事件总线？
  → kiko/async

需要把 JSX 挂到 DOM、处理属性/事件/ref、门户、样式、React 桥接？
  → kiko/dom-rendering

需要条件渲染、列表、错误边界、异步组件/懒加载、SSR 抠洞？
  → kiko/control-flow

需要服务端渲染字符串/流 + 客户端水合 + 信号状态下发？
  → kiko/ssr

需要声明式路由 / 导航 / 守卫 / 离屏保留 / URL 状态？
  → kiko/router

需要开发期热更新（组件原位替换、状态保留）？
  → kiko/hmr
```

## 跨包关键概念

- **组件体惰性物化**：无 re-render 循环。`function App() { return <div>{x}</div> }` 只跑一次；`jsx(组件)` 返回待物化占位，组件体在消费点（render / 父元素 children / 控制流分支 / 水合采纳）执行。未展示分支不执行。`realize(lazy)` 显式物化且**按占位对象缓存**（同一占位重复 realize 返回同一批节点，组件体不会跑第二次）。
- **`Signal.State` 是标准接口**：`s.get()` 读、`s.set(v)` 写（也接受 `v => v+1` 函数式写）；`computed(fn)` 返回只读 `Signal.Computed`（内部写信号会抛错）。
- **`render()` 返回 `dispose`**：整体卸载时清理 watcher、事件监听与清理回调。重复挂载到同一容器会先拆除旧树；`render` 会清空整个 `container.innerHTML`。
- **一次性取值 vs 响应式绑定**：放进 JSX / 传给 `Show`/`For` / 在 `computed`/`effect` 内读取才建立订阅；`.get()` 出现在组件体顶层、`if` 条件或普通表达式里都只是一次快照（组件不会再跑）。
- **SSR 一句话入口**：`renderToPage(() => <App/>)` 返回 `{ html, stateScript }`（内部含请求作用域 + 信号捕获）；客户端 `hydrate(() => <App/>, el)` 自动读取页面内 `<script id="kiko-state">` 恢复信号，无需额外调用。

## 约束与陷阱

- `@kikojs/signal` 已**不再导出 `derived`**（旧别名已移除），请用 `computed`。
- **store 写入只能用 `.set()` / `.signal.set()`**：代理的 `set` trap 返回 `false`，`store.x = v` 在严格模式下抛 `TypeError`；`.get()` 返回的是 deepFreeze 只读快照。
- `Signal.Computed` 订阅不到「普通字段值」变化——这是 keyed `For` 的 index 做成 `Signal.State` 的原因（见 `kiko/control-flow`）。
- `<style>` 内联元素就是 `Style` 组件（默认作用域 CSS，`<style global>` 全局），见 `kiko/dom-rendering`。
- `@kikojs/dom/server` 的渲染函数接收 **thunk**：`renderToFragment(() => <App/>)`，不是节点本身。
- **并发 SSR 必须包 `withSSRScope`**（SSR 运行时与信号捕获槽位按请求隔离）；`renderToPage` 已内含，直接调用 `renderToFragment`/`renderToStream` 时需自行包裹，否则并发请求的信号值会互相污染。
- **`hydrateWithState` 已移除**：状态恢复能力内置进 `hydrate()`（也接受显式 `options.state`）。
- `Router`/`Link` 的 **path/hash history 是客户端专用**（读取 `window`）。SSR 用 `createMemoryHistory` + `withSSRRouter`（`@kikojs/router/server`），渲染前 `await router.ready`；路由树水合已支持（`hydrate` 直接采纳 SSR 产物，见 `kiko/router`）。

## 参考实现

monorepo 含完整示例与文档：

- `examples/basic`、`examples/htm`、`examples/react-portal`、`examples/ssr`（全栈 SSR + 水合 + NoSSR）、`examples/hmr`（热更新）
- `docs/` 静态文档站（`signal.html` / `dom.html` / `router.html` / `hmr.html` / `guide.html` / `examples.html` / `api.html`），构建：`bun run docs/build.ts`
