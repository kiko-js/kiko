---
name: kiko/dom-rendering
description: >-
  @kikojs/dom 的渲染层：JSX 工厂（jsx/jsxs/jsxDEV/Fragment）、信号绑定规则、
  render 挂载与 dispose、hydrate 水合与状态自动恢复、惰性物化（realize 按占位缓存、
  children 检查 childrenToArray/childTag/childProps）、createPortal、ReactPortal、
  Style（<style> 作用域 CSS）。讲解信号如何绑到文本/属性/事件/结构。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/signals
---

# DOM 渲染（@kikojs/dom）

JSX 编译为真实 DOM 节点，无虚拟 DOM。**组件体惰性物化**：`jsx(组件)` 返回待物化占位，组件体在消费点执行（render / 父元素 children / 控制流分支 / 水合采纳）；响应式来自每个信号「读取点」的 watcher。

## 入口与挂载

```tsx
/** @jsxImportSource @kikojs/dom */
import { render, hydrate, createPortal, Fragment, Style } from "@kikojs/dom"

const dispose = render(<App />, document.getElementById("app")!) // 返回卸载函数
const stop = hydrate(() => <App />, document.getElementById("app")!) // root 传 thunk
const anchor = createPortal(<div class="modal" />, document.body) // 返回锚点 Comment
```

- `jsx`/`jsxs`/`jsxDEV` 由编译器按 `jsxImportSource` 调用，一般无需手写。
- `render` 会先拆除容器内已有的 kiko 树，再清空整个 `container.innerHTML`；返回的 `dispose()` 同样清空容器。
- `hydrate` 采纳 SSR 产出的 DOM，**自动读取容器/文档内的 `<script id="kiko-state">` 恢复信号**；`options.state` 可显式传入，`options.strict` 把错位告警升级为 throw。dispose 不会清空 `innerHTML`。
- `createPortal` 客户端专用（SSR 调用抛错）；信号子节点照常响应式，锚点随宿主树一起清理。

## 信号绑定

在 props/children 里直接传 `Signal.State` / `Signal.Computed`，kiko 自动建 watcher 精准更新：

```tsx
const name = createSignal("kiko")
const count = createSignal(0)

<div title={name}>{name}</div>                       // 属性与文本都响应式
<button onClick={() => count.set(count.get() + 1)}>{count}</button>

<div style={{ color: "red" }} />                     // 对象 style 逐键 setProperty
<div style={styleSignal} />                          // 字符串 / 对象 / 信号均可切换

const view = createSignal(<span>a</span>)
<div>{view}</div> // 值为 Node / 数组 → 锚点标记整棵子树替换并清理旧子树
```

规则与陷阱：

- **要响应式就把信号传进 JSX**：`when={count.get() > 0}` 只是快照；应传 `count` 或 `computed`。
- 文本/属性/事件按值更新；值解析为 `Node` 或 `Node[]` 用锚点 Comment 做结构替换。
- `onXxx` 传函数，按需重建；冒泡事件走委托，`onXxxCapture` 与不冒泡事件用直接监听。
- `style`：字符串 → `setAttribute`；对象 → 逐 key `setProperty`；**非信号对象切换时不会清理旧 key**，动态切换请用信号。
- `key` 与 `children` 是保留键（分别用于列表键与子节点），不会落到 DOM。

## ref

函数式 ref（可返回 cleanup）或对象 `{ current }` 形式：

```tsx
<div
  ref={el => {
    const obs = new ResizeObserver(() => {})
    obs.observe(el)
    return () => obs.disconnect() // 卸载 / 分支切换 / 结构替换时自动调用
  }}
/>
```

- 组件级 `ref` 是 jsx 层属性（不进入 props）：只有组件返回**单个元素**时才触发，多节点只 `console.warn` 并忽略。
- 对象 ref 的 `.current` 在卸载时**不会**被置回 `null`；只有函数 ref 的 cleanup 会被调用。

## 惰性物化与 children 检查

```tsx
import { realize, isLazy, childrenToArray, childTag, childProps } from "@kikojs/dom"

const el = realize(<Card />) // 显式物化：按占位缓存，重复 realize 返回同一批节点
```

- `realize` 结果按占位对象缓存：同一占位反复调用组件体**只执行一次**；`isLazy` 用 `Symbol.for` 品牌识别，跨库副本也认。
- 父组件可在**不执行子组件体**的前提下检查 children：

```tsx
function Tab(props: { name: string }) {
  return <span>{props.name}</span>
}

function Tabs(props: { active: string; children: unknown }) {
  const picked = childrenToArray(props.children).filter(c => {
    const p = childProps(c) // 读占位 props，不触发子组件执行
    return (
      childTag(c) === Tab &&
      typeof p === "object" &&
      p !== null &&
      "name" in p &&
      p.name === props.active
    )
  })
  return <div>{picked}</div> // 只有选中分支会在消费点物化
}
```

- `childrenToArray` 展平数组并丢弃 null/undefined/boolean，信号与占位保持不透明（不求值）。

## 父组件按数据选分支 / 费时属性

组件函数只跑一次，写在里面的 `if` 不会跟着数据变：

```tsx
function Parent() {
  const tab = createSignal<"a" | "b">("a")
  const body = computed(() => (tab.get() === "a" ? <A /> : <B />)) // 整块随信号替换
  return <div>{body}</div>
}

// 属性表达式会先算好再传进去；费时计算包一层函数传进去，在组件内调用
const view = <Foo v={() => expensive()} />
```

## Style（`<style>` 作用域 CSS）

`<style>` 内联元素就是 `Style` 组件。默认**作用域**：选择器改写并限定到最近祖先元素（该元素获得 `data-kiko-vN`）；`global` 跳过改写直接注入。

```tsx
const card = (
  <div class="card">
    <style>{`
      .card { border: 1px solid #232838; padding: 16px; }
      & .badge { color: var(--brand); }
      :deep(.x) { color: red; }   /* 穿透作用域 */
      @media (max-width: 600px) { .card { padding: 8px; } }
    `}</style>
    <p class="badge">kiko</p>
  </div>
)

const globalStyle = <style global>{`body { background: #0b0d10; }`}</style>
<Style nonce="abc123">{cssSignal}</Style> // 支持 nonce 与信号化 CSS
```

- 没有祖先元素（fragment 根）时 scoped CSS 不生效并告警——包一层元素或改用 `global`。
- 基于 constructable stylesheets（`adoptedStyleSheets`），不支持的环境回退为真实 `<style>` 元素。

## ReactPortal（React 桥接）

```tsx
import { ReactPortal } from "@kikojs/dom/react-portal"

// signal prop 变化自动重渲染 React root
const view = <ReactPortal component={MyChart} data={data} />
```

`react` / `react-dom` 是可选 peer 依赖，仅在导入该子路径时异步加载。

## 陷阱

- 不要依赖组件函数重跑——要响应式就把值做成信号并放进 JSX。
- `hydrate` 的采纳游标是模块级单实例：一次调用必须是一个同步栈，不能并发/嵌套多个根。
- `@kikojs/dom` 只自带最小 signal 子集；需要 `computed`/`effect`/store 等请从 `@kikojs/signal` 导入，两包信号可互通。
