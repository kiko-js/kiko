---
name: kiko/ssr
description: >-
  @kikojs/dom/server 服务端渲染与水合：renderToFragment / renderToStream、
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

## 渲染函数（接收 thunk）

```tsx
/** @jsxImportSource @kikojs/dom */
import { renderToFragment, renderToStream } from "@kikojs/dom/server"

// 片段：返回 Promise<string>，等待整棵树 resolve
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

// 流式：返回 ReadableStream<string>，同步骨架立即 flush，异步内容 resolve 后补发
const stream = renderToStream(() => (
  <main>
    <h1>同步标题</h1>
    <Suspend fallback={<p>加载中…</p>}>
      <LazyCard />
    </Suspend>
  </main>
))
return new Response(stream, { headers: { "content-type": "text/html" } })
```

- 必须传**函数（惰性求值）**：JSX 若在 SSR 模式开启前被急切求值会拿到错误结果。
- `renderToStream` 的 TTFB 低于 `renderToFragment`（同步内容立即输出），但 scoped `<Style>` 在流式模式下被丢弃并告警（scope 属性无法回溯；不降级为全局以免泄漏）——需要 scoped css 请用 `renderToFragment` 或 `<Style global>`。

## 信号序列化（SSR → 水合状态传递）

默认水合假设「客户端初始值 == SSR 快照」。跨端传值用信号序列化：

```tsx
// 服务端
import { renderToFragment, startSignalCapture, serializeSignals } from "@kikojs/dom/server"

startSignalCapture()
const html = await renderToFragment(() => <App />)
const state = serializeSignals()
stopSignalCapture()
// 嵌入 HTML：<script id="kiko-state" type="application/json">${state}</script>

// 客户端
import { hydrateWithState } from "@kikojs/dom"
hydrateWithState(() => <App />, document.getElementById("app")!)
// 自动读取 <script id="kiko-state"> 并恢复信号初始值
```

API（按端拆分：捕获/序列化在 `@kikojs/dom/server`，恢复在 `@kikojs/dom`）：

- `startSignalCapture()` / `stopSignalCapture()` — 渲染前后调用，按 createSignal 顺序记录信号（server 入口）
- `serializeSignals()` — 返回 envelope JSON `{"v":1,"s":[value0, value1, ...]}`（`v` 为格式版本）；`signalStateScript()` 直接产出可嵌入的 `<script>` 块（server 入口）
- `hydrateWithState(root, container, state?)` — 恢复 + 水合一体化；`state` 可选（envelope 对象或 JSON 字符串），省略时从容器内 `<script id="kiko-state">` 读取（主入口）

限制：仅捕获 `@kikojs/dom` 的 `createSignal`；JSON 不支持 undefined/Date/Map/Set/循环引用（类型保真可用 `setSignalStateCodec`，两端各注册 encode/decode 一半）；非并发安全。

## 作用域样式（Style）在 SSR 端

`<Style>` 的作用域属性通过**内联标记** `<!--kiko-scope:attr-->` 落到正确元素，由最内层包含元素提取。两个渲染入口都会清掉残留的无主标记。

**CSP nonce 支持**：`<Style nonce="abc123">` 透传 nonce 到 `<style>` 标签，适配 `style-src 'nonce-...'` 策略。

```tsx
// 服务端
<Style nonce="abc123">{`.card { color: red }`}</Style>
// 输出: <style nonce="abc123" data-kiko-v1>[data-kiko-v1] .card{color:red}</style>

// 客户端（constructable sheet 模式不支持 nonce，仅 fallback <style> 生效）
<Style nonce="abc123">{`.card { color: red }`}</Style>
```

**Fragment 根节点警告**：`<Style>` 在 fragment 根节点（无祖先元素）时会输出 `console.warn`，提示 scoped CSS 不会生效。建议把 `<Style>` 放在元素内部，或显式使用 `<Style global>`。

## 客户端水合

```tsx
import { hydrate, hydrateWithState } from "@kikojs/dom"

// 基础水合（假设客户端初始值 == SSR 快照）
const stop = hydrate(() => <App />, document.getElementById("app")!)

// 带状态恢复的水合（推荐：跨端传值）
const stop2 = hydrateWithState(() => <App />, document.getElementById("app")!)
```

hydrate 需要 SSR 端输出可对齐。已处理的边界：

- **相邻文本合并**：SSR 端如 `["count = ", count, "…"]` 产生的相邻文本节点会被 HTML 解析合并为一个文本节点。水合端在文本分支做**前缀匹配 + `splitText`**，保证「一个值 = 一个节点」对齐。
- **Show 分支切换**：水合后的 `children`/`fallback` 是 `PendingNode`，信号驱动切换时用 `rebuild`（`() => jsx(tag, props)`）重建，避免序列化占位串。
- **For**：初次按游标采纳现有节点；此后的信号更新与客户端共用同一
  ForCore 引擎（显式 keyed 或默认条目身份复用），水合采纳的节点照常复用。
- **ErrorBoundary**：静态采用；出错时客户端侧接管。
- **Suspend / 未决 lazy**：先静态采用既有节点，直到模块 settle 后替换为真实内容；
  迟到的过期结果（已被新内容取代或已清理）直接丢弃，不会消费水合游标。
- **信号值失配**：水合期若文本值与期望值不一致，以客户端值回填并 `console.error("[kiko hydrate] text mismatch: ...")` 告警。
