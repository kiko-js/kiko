---
name: kiko/ssr
description: >-
  @kikojs/dom/server 服务端渲染与水合：renderToFragment / renderToDocument、
  导入即注册字符串运行时、控制流与 Style 的 SSR 支持、客户端 hydrate 的
  对齐规则（相邻文本合并的 splitText、Show 分支重建、Suspend 静态采用）。
  参考全栈示例 examples/ssr。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/dom-rendering
  - kiko/control-flow
---

# SSR 与水合（@kikojs/dom/server）

`@kikojs/dom/server` 是服务端渲染入口：**导入本模块即注册 SSR 字符串运行时**。组件代码仍从 `@kikojs/dom` 导入 `jsx`/控制流组件，运行时自动把它们切到字符串模式；客户端 bundle 不导入本模块，SSR 代码可 tree-shake 剔除。

## 渲染函数（接收 thunk，返回 Promise<string>）

```tsx
/** @jsxImportSource @kikojs/dom */
import { renderToDocument, renderToFragment } from "@kikojs/dom/server"

// 片段：任意子树，不带 doctype。信号取当前快照，Suspend 等待 promise 后再输出
const fragment = await renderToFragment(() => (
  <main>
    <p>{count}</p>
    <Show when={count.get() > 0} fallback="empty">
      …
    </Show>
    <Suspend fallback={<p>加载中…</p>}>
      <Card />
    </Suspend>
  </main>
))

// 完整文档：根为 <html>，自动前置 <!DOCTYPE html>
const page = await renderToDocument(() => (
  <html lang="zh-CN">
    <head>
      <title>kiko</title>
    </head>
    <body>hello</body>
  </html>
))
```

- 必须传**函数（惰性求值）**：JSX 若在 SSR 模式开启前被急切求值会拿到错误结果，`renderToDocument(() => <App/>)`。
- 服务端可用时（无需 DOM），控制流、`<Style>`、`lazy` 均支持。

## 作用域样式（Style）在 SSR 端

`<Style>` 的作用域属性通过**内联标记** `<!--kiko-scope:attr-->` 落到正确元素，由最内层包含元素提取（而非序列化顺序队列——顺序队列会把 scope 属性错误落到兄弟元素上）。两个渲染入口都会清掉残留的无主标记。

## 客户端水合

```tsx
import { hydrate } from "@kikojs/dom"

const stop = hydrate(() => <App />, document.getElementById("app")!)
```

hydrate 需要 SSR 端输出可对齐。已处理的边界：

- **相邻文本合并**：SSR 端如 `["count = ", count, "…"]` 产生的相邻文本节点会被 HTML 解析合并为一个文本节点。水合端在文本分支做**前缀匹配 + `splitText`**，保证「一个值 = 一个节点」对齐。
- **Show 分支切换**：水合后的 `children`/`fallback` 是 `PendingNode`，信号驱动切换时用 `rebuild`（`() => jsx(tag, props)`）重建，避免序列化占位串。
- **For**：children 是函数，每次渲染按 cursor 重建。
- **ErrorBoundary**：静态采用；出错时客户端侧接管。
- **Suspend / 未决 lazy**：先静态采用既有节点，直到模块 settle 后替换为真实内容。

## 全栈参考：examples/ssr

`examples/ssr` 是完整的 Bun 全栈示例：

- `server.tsx`：`Bun.serve` 用 `renderToFragment` 产出 App，服务端手动组装 html/head/body 骨架并注入 `<script type="module" src="/client.js">`（App 根为 `<main>`，无 `</body>` 可注入，故不用 `renderToDocument` 的完整文档）。
- `bundler.ts`：`Bun.build`，`jsx` 选项用**对象形式** `{ runtime: "automatic", importSource: "@kikojs/dom" }`（字符串形式在 Bun 1.3.14 抛 `jsx must be an object`），`splitting: true`。
- `client.tsx`：`hydrate` 入口。
- 运行：`bun run dev`（= bundler + server），`PORT` 环境变量覆盖端口。

## 陷阱

- 渲染函数是**异步**的（`Suspend`/`lazy` 等待 promise）。
- 不要在水合容器里重新 `render`（会覆盖而非采用既有 DOM）；用 `hydrate`。
- 未决的异步模块在水合端是静态采用，需等 settle 后才成为真实节点——不要在 hydrate 后立即断言异步子树内容。
