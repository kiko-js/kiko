# kiko

一个基于 [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill)（TC39 Signals 提案的 polyfill）构建的细粒度响应式 DOM 库。JSX 直接编译为真实 DOM 节点，组件函数只执行一次；信号变化只更新被读取到的那个节点。

> **项目状态**：kiko 目前处于**早期开发阶段**（`v0.0.1`），公共 API 尚未稳定，随时可能出现破坏性变更（breaking changes）。请将依赖锁定到具体版本，并在升级时留意变更说明。

> English version: [README.en.md](./README.en.md)

## 特性

- **无虚拟 DOM、无 diff**——JSX 编译为真实节点，响应式来自信号绑定。
- **细粒度响应式**——信号在 props / children 里按「读取点」建 watcher，精准更新对应节点；值解析为节点/数组时整棵子树替换。
- **标准信号接口**——所有信号都是标准 TC39 `Signal.State` / `Signal.Computed`，任何消费该接口的库都能直接使用。
- **SSR + 水合**——`@kikojs/dom/server` 输出字符串，客户端 `hydrate` 对齐既有 DOM。
- **作用域 CSS**——`<style>` 内联元素即作用域样式组件，Vue 风格 scoped css 而无需模板编译器。
- **控制流组件**——`Show` / `For` / `ErrorBoundary` / `Suspend` / `lazy`。
- **React 桥接**——`ReactPortal` 把 React 组件嵌进 kiko 树。

## 包

| 包               | 入口                                                           | 作用                                                                                                                     |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@kikojs/signal` | `@kikojs/signal`                                               | `createSignal` / `computed` / `effect` / `batch` / `untrack` / `on` / `createStore` / `createResource` / `createEmitter` |
| `@kikojs/dom`    | `@kikojs/dom`、`@kikojs/dom/jsx-runtime`、`@kikojs/dom/server` | JSX 工厂、`render` / `hydrate`、控制流组件、`lazy`、`Style`、`createPortal`、SSR 入口                                    |
| `@kikojs/router` | `@kikojs/router`                                               | `createRouter`、`Router` / `Link` / `Outlet` / `Navigate`、hooks、守卫                                                   |

`@kikojs/dom` **不依赖** `@kikojs/signal`——它自带一份薄薄的 signal-polyfill 封装，保持自包含。

## 快速开始

```bash
bun add @kikojs/signal @kikojs/dom
```

TSX 文件顶部加 `jsxImportSource` pragma（或在项目 tsconfig 设置）：

```tsx
/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/signal"
import { render } from "@kikojs/dom"

function App() {
  const count = createSignal(0)
  return <button onClick={() => count.set(count.get() + 1)}>{count}</button>
}

const dispose = render(<App />, document.getElementById("app")!)
```

`{count}` 直接把 `Signal.State` 放进子节点——kiko 为这个绑定建 watcher，点击后只更新该文本节点。

## 示例

| 示例                    | 说明                                       |
| ----------------------- | ------------------------------------------ |
| `examples/basic`        | 计数器，Bun bundler + 开发服务器           |
| `examples/htm`          | `dom` / `htm` 标签模板运行时（无构建 JSX） |
| `examples/react-portal` | ReactPortal 桥接 React 组件                |
| `examples/tailwind`     | Tailwind + kiko                            |
| `examples/ssr`          | 全栈 Bun 服务端渲染 + 客户端水合           |

## 文档

访问项目官网：**https://kiko-js.github.io/kiko/**

官网源码位于 `docs/`（静态 HTML，含 `signal.html` / `dom.html` / `router.html` / `examples.html` / `api.html`），由 GitHub Actions 构建并部署到 GitHub Pages。

## 开发

```bash
bun install          # 安装依赖（workspaces：packages/*、examples/*、docs）
bun test             # 全量测试
bun run lint         # oxlint
bun run fmt          # oxfmt 格式化
bun run site:build   # 构建文档站（docs/build.ts）
```

## 许可证

MIT
