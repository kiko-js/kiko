# @kikojs/dom

基于 [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill) 的响应式 DOM 库：自定义 JSX 运行时直接编译为真实 DOM 节点（无虚拟 DOM、无 diff），组件体推迟到消费点执行（惰性物化），信号变化只更新被读取到的节点。

## 安装

```bash
bun add @kikojs/dom
# 或
npm install @kikojs/dom
```

## 配置 JSX

在 `tsconfig.json` 中启用自定义 JSX 运行时：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@kikojs/dom"
  }
}
```

或在每个 `.tsx` 文件顶部声明：`/** @jsxImportSource @kikojs/dom */`。

## 快速开始

```tsx
import { createSignal, render } from "@kikojs/dom"

function Counter() {
  const count = createSignal(0)
  return <button onClick={() => count.set(count() + 1)}>count: {count}</button>
}

render(<Counter />, document.getElementById("app")!)
```

信号可以直接嵌入 children / props / 属性，更新时只重写对应的文本节点或属性；信号值为 `Node` 或数组时会触发 marker 锚定的子树替换（结构化响应式）。

## 惰性物化（lazy materialization）

`jsx(组件)` 不再立即执行组件体，而是返回一个待物化占位；组件体在消费点执行——父组件体内（`appendChild`/`toNodes`）、`render`/`createPortal` 挂载点、或水合采纳该 children 时。语义变化：

- children 不再先于父组件求值：`<Router><Outlet/></Router>` 等词法写法直接成立（不再需要 thunk children）。
- 未展示分支的组件体不执行：`<Show when={false}>{<Heavy/>}</Show>` 中 `Heavy` 零成本。
- 水合对齐不受影响：惰性求值发生在游标采纳位置上，保持「采纳顺序 == 求值顺序 == 文档序」。

需要节点对象本身时用 `realize` 显式物化（同步执行组件体，返回的节点身份稳定）；需要在挂载后拿到根元素时用组件级 `ref`（jsx 层属性，不进入组件 props；水合期在元素采纳完成后触发）：

```tsx
import { render, realize } from "@kikojs/dom"

const el = realize(<Card />) // 同步物化，el 是真实节点
render(<Card ref={node => console.log(node)} />, container)
```

## 控制流与扩展

- `Show` / `For`：条件与列表渲染；`For` 无 `getKey` 时默认按条目引用复用节点（移动不重建、children 不重跑；重复条目回退整表重建），`getKey` 提供显式 key
- `ErrorBoundary`：渲染错误隔离
- `Suspend` / `lazy`：异步组件与代码分割
- `Style`：作用域 CSS
- `hydrate`：服务端 HTML 水合（配合 `@kikojs/dom/server` 的 `renderToFragment`）
- `createPortal`：渲染到其他容器

## 行为语义与前提

- **真值判定（SolidJS 风格）**：`false`、`null`、`undefined`、`""`、`0` 均为 falsy——`<Show when={0}>` 走 fallback。
- **`For` 的条目复用**：无 `getKey` 时按条目引用（SameValueZero）复用——对象/函数按引用、原始值按值，移动不重建、children 不重跑；重复条目（同一引用或相同原始值出现两次）回退整表重建（children 全部重跑）。`getKey` 模式下 children 收到 accessor：存活的 key 原地更新绑定，children 函数每个 key 生命周期内至多跑一次。
- **`Show` 的 children**：函数 children 在每次 `when` 变化且为真时重跑；静态 children 是同一批节点，切换分支时保留内部绑定，换回时复用，真值不变时不重插 DOM。
- **`Suspend` 的 SSR 产物结构**：`<!--suspend-->…<!--/suspend-->`，未决 promise 时中间是 fallback 内容，settle 后换入真实内容（流式模式结构相同）。
- **`hydrate()` 的前提**：两端组件树一致、`createSignal` 创建顺序一致（数量失配会 `console.error` 报出两端计数）。服务端嵌入了信号状态（`script#kiko-state`）必须用 `hydrateWithState()`——裸 `hydrate()` 会忽略该状态并告警。错位默认 `console.error`（带采纳位置与所在元素），测试/CI 可用 `hydrate(root, el, { strict: true })` 升级为 throw。
- **SSR 信号状态的 JSON 契约**（`serializeSignals` / `restoreSignals` / `signalStateScript` / `hydrateWithState`）：默认只做 `JSON.stringify` / `JSON.parse` 往返，零逐值校验、零报错——信号值只承诺 **JSON 语义等价**（有限数 / string / boolean / null / 纯对象 / 数组），其余类型（Date / Map / Set / 类实例 / undefined / NaN…）由 JSON 静默降级。排查类型降级时让**服务端以开发模式运行**（`NODE_ENV=development`，由 Node 环境变量判定、无独立开关）：服务端跑无损 gate，无法完美转换的值记录错误并在 envelope `l` 字段标记位置；客户端恢复逻辑**常驻且数据驱动**（不读 env、无开关），无条件兑现 `l` 标记并在命中处直接 throw（fail-fast）——生产不报错只因生产服务端从不产出 `l`。类型保真用**依赖注入 codec** `setSignalStateCodec({ encode, decode })`——`encode` 在服务端把值转成可往返的 tag（如 `Date → { $date: iso }`），`decode` 在客户端还原；两端需共享同一份对称实现。
- **dispose 必须调用**：`render` / `hydrate` 返回的 disposer 负责拆除 watcher 与委托根；不调用则根级 cleanup（如 Router dispose）与节点 watcher 永久驻留。

## 事件委托与挂载点

冒泡事件（click、input、change、keydown 等）通过**挂载点级委托**分发：`render` / `hydrate` 的容器和 `createPortal` 的目标各自持有一组监听器，document 上没有 kiko 监听器。这意味着：

- 多个挂载点彼此隔离：app A 里的事件永远不会触发 app B 的 handler；外部 DOM 不受影响。
- `dispose()` 后该挂载点彻底停止观测。
- **不要把 `createPortal` 的目标设为另一个 app 的 `render` 容器**：`render` 的清理会清空整个容器（`innerHTML = ""`），寄居其中的 portal 节点会被一并移除，事件随之失效。portal 目标应使用独立容器（如 `document.body`），或由持有它的 app 全权管理其生命周期。
- 未经 `render` / `hydrate` / `createPortal` 挂载的元素（裸 `jsx` 创建后手动插入 DOM）没有委托根，冒泡事件 handler 不会触发；非冒泡事件（focus、blur 等）始终为直连监听，不受影响。

## 子路径导出

- `@kikojs/dom`：客户端运行时（JSX 工厂、render、控制流）
- `@kikojs/dom/server`：SSR 字符串运行时（`renderToFragment`、`renderToStream`）
  与请求级作用域 `withSSRScope`。**并发渲染**（HTTP 服务每请求一段）必须把请求
  处理包进 `withSSRScope(async () => { ... })`，SSR 运行时与信号捕获/恢复状态才
  按请求隔离；串行使用无需包裹。
- `@kikojs/dom/jsx-runtime`：JSX 运行时入口（`jsx`、`jsxs`、`jsxDEV`、`Fragment`）
- `@kikojs/dom/react-portal`：React ↔ kiko 桥接

## 文档

- 官网：<https://kiko-js.github.io/kiko/>
- 源码：<https://github.com/kiko-js/kiko>
