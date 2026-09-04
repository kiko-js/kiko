---
name: kiko/dom-rendering
description: >-
  @kikojs/dom 的渲染层：JSX 工厂（jsx/jsxs/jsxDEV/Fragment）、惰性物化
  （组件体推迟到消费点执行；realize 显式物化；组件级 ref）、render 挂载与
  dispose、hydrate 水合、createPortal 门户、Style（<style> 作用域 CSS）。
  讲解信号如何绑到文本/属性/事件，以及何时做结构响应式替换。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/signals
---

# DOM 渲染（@kikojs/dom）

JSX 编译为真实 DOM 节点，无虚拟 DOM。**组件体惰性物化**：`jsx(组件)` 返回待物化占位，组件体在消费点执行；响应式来自每个信号「读取点」的 watcher。

## JSX 工厂与入口

```tsx
/** @jsxImportSource @kikojs/dom */
import { render, hydrate, createPortal, Fragment } from "@kikojs/dom"

// 挂载，返回 dispose() 用于整体卸载
const dispose = render(<App />, document.getElementById("app")!)

// 水合既有 SSR DOM（见 kiko/ssr）；root 传 thunk () => node
const stop = hydrate(() => <App />, document.getElementById("app")!)

// 门户：渲染到任意 container，返回锚点 Comment
const anchor = createPortal(<div />, document.body)

// Fragment：<></>
const frag = <Fragment>{items}</Fragment>
```

`jsx`/`jsxs`/`jsxDEV` 由 JSX 编译器按 `jsxImportSource` 调用，一般无需手动调用。

## 信号绑定

在 props/children 里直接传 `Signal.State` / `Signal.Computed`，kiko 自动建 watcher 精准更新：

```tsx
const name = createSignal("kiko")
const count = createSignal(0)

<div title={name}>{name}</div>            // 属性与文本都响应式
<button onClick={() => count.set(count.get()+1)}>{count}</button>

// style 支持字符串、对象、或二者的信号
<div style={{ color: "red" }} />
<div style={styleSignal} />

// 信号值为 Node / 数组 → 标记锚点整棵子树替换（结构响应式）
const view = createSignal(<span>a</span>)
<div>{view}</div>   // view.set(<em>b</em>) 时整块替换，并清理旧子树
```

规则：

- 文本/属性/事件：按值更新。
- 值解析为 `Node` 或 `Node[]`：用锚点 Comment 做结构替换。
- 事件 `onXxx` 传函数，按需重建（`signal` 驱动的 handler 亦然）。
- `style`：字符串 → `setAttribute`；对象 → 按 key 逐个 `setProperty`（切换时清理旧 key）；信号同理。切换字符串/对象/null 均正确。
- `key` 与 `children` 是保留键（分别用于列表键与子节点）。

## ref

函数式 ref（可返回 cleanup）或对象 `{ current }` 形式：

```tsx
<div
  ref={el => {
    const obs = new ResizeObserver(entries => console.log(entries))
    obs.observe(el)
    return () => obs.disconnect() // 卸载（Show 切换 / dispose / 结构替换）时自动调用
  }}
/>
```

## 惰性物化（lazy materialization）

组件标签的 `jsx(tag, props)` 不再立即执行组件体，而是返回占位对象；组件体在**消费点**执行：

- 挂载点：`render` / `createPortal`。
- intrinsic children：父元素构造时（`<div><Comp/></div>` 的 `Comp` 在 div 构建内执行）。
- 控制流：`Show`/`For`/`ErrorBoundary`/`Suspend` 渲染该分支时——**未展示分支的组件体不执行**。
- 水合：游标采纳该 children 时（保持「采纳顺序 == 求值顺序 == 文档序」）。

由此 children 不再先于父组件求值：`<Router><Outlet/></Router>` 等词法写法直接成立，无需 thunk children。

获取真实节点的两条路：

```tsx
import { realize } from "@kikojs/dom"

const el = realize(<Card />) // ① 显式物化：同步执行组件体，节点身份稳定

render(
  <Card
    ref={node => {
      /* ② 组件级 ref：物化出根元素后触发一次 */
    }}
  />,
  container,
)
```

规则与陷阱：

- `ref` 是 **jsx 层属性**：组件收不到它（不会进入 props）。组件返回单个元素时触发；函数 ref 可返回 cleanup（随 dispose 清理）。多节点输出的组件没有「唯一根」，ref 被忽略并告警。
- `realize` 不缓存：同一占位物化两次 = 组件体执行两次 = 两棵独立节点树。需要身份复用时先 `realize` 一次再传递。
- SSR 字符串路径仍按文档序急切求值——水合对齐依赖此契约，不要让 SSR 端依赖「惰性」。

## Style（`<style>` 作用域 CSS）

`<style>` 内联元素就是 `Style` 组件。默认**作用域**：选择器改写并限定到最近祖先元素，该元素获得 `data-kiko-vN`；`global` 属性跳过改写直接注入。基于 constructable stylesheets（`document.adoptedStyleSheets`，Chrome 73+ / Firefox 101+ / Safari 16.4+），否则回退到真实 `<style>` 元素。

```tsx
const card = (
  <div class="card">
    <style>{`
      .card { border: 1px solid #232838; padding: 16px; }
      & .badge { color: var(--brand); }
      @media (max-width: 600px) { .card { padding: 8px; } }
    `}</style>
    <p class="badge">kiko</p>
  </div>
)

const globalStyle = <style global>{`body { background: #0b0d10; }`}</style>
```

- 作用域匹配按**后代**限定，响应式子树自动覆盖。
- 支持 `nonce` 属性、信号化的 CSS 文本、嵌套数组。
- 纯净的 css 工具函数见 `packages/dom/src/style.ts`（`rewriteScopedCss` / `createScopeAttr` 等）。

## 陷阱

- 不要对组件函数依赖「重跑」——要响应式，把值做成信号并放进 JSX。
- 重复 `render` 到同一容器会先拆除旧树（清理 watcher/cleanup），再覆盖 DOM。
- `hydrate` 需要 SSR 端输出可对齐（见 `kiko/ssr` 的水合规则）。
