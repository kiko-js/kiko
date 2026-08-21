# @kikojs/dom

基于 [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill) 的响应式 DOM 库：自定义 JSX 运行时直接编译为真实 DOM 节点（无虚拟 DOM、无 diff），组件函数只执行一次，信号变化只更新被读取到的节点。

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

## 控制流与扩展

- `Show` / `For`：条件与列表渲染（非 keyed 协调）
- `ErrorBoundary`：渲染错误隔离
- `Suspend` / `lazy`：异步组件与代码分割
- `Style`：作用域 CSS
- `hydrate`：服务端 HTML 水合（配合 `@kikojs/dom/server` 的 `renderToFragment`）
- `createPortal`：渲染到其他容器

## 事件委托与挂载点

冒泡事件（click、input、change、keydown 等）通过**挂载点级委托**分发：`render` / `hydrate` 的容器和 `createPortal` 的目标各自持有一组监听器，document 上没有 kiko 监听器。这意味着：

- 多个挂载点彼此隔离：app A 里的事件永远不会触发 app B 的 handler；外部 DOM 不受影响。
- `dispose()` 后该挂载点彻底停止观测。
- **不要把 `createPortal` 的目标设为另一个 app 的 `render` 容器**：`render` 的清理会清空整个容器（`innerHTML = ""`），寄居其中的 portal 节点会被一并移除，事件随之失效。portal 目标应使用独立容器（如 `document.body`），或由持有它的 app 全权管理其生命周期。
- 未经 `render` / `hydrate` / `createPortal` 挂载的元素（裸 `jsx` 创建后手动插入 DOM）没有委托根，冒泡事件 handler 不会触发；非冒泡事件（focus、blur 等）始终为直连监听，不受影响。

## 子路径导出

- `@kikojs/dom`：客户端运行时（JSX 工厂、render、控制流）
- `@kikojs/dom/server`：SSR 字符串运行时（`renderToFragment`）
- `@kikojs/dom/jsx-runtime`：JSX 运行时入口（`jsx`、`jsxs`、`jsxDEV`、`Fragment`）
- `@kikojs/dom/react-portal`：React ↔ kiko 桥接

## 文档

- 官网：<https://kiko-js.github.io/kiko/>
- 源码：<https://github.com/kiko-js/kiko>
