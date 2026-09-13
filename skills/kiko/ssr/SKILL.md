---
name: kiko/ssr
description: >-
  @kikojs/dom/server 服务端渲染与水合：renderToPage（一句话：HTML + 信号状态脚本）、
  renderToFragment / renderToStream（流式、AbortSignal）、withSSRScope（并发请求隔离）、
  信号捕获/序列化/恢复与 codec、客户端 hydrate 的自动状态恢复与对齐规则、
  NoSSR、Style 的 SSR 限制。参考全栈示例 examples/ssr。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/dom-rendering
  - kiko/control-flow
---

# SSR 与水合（@kikojs/dom/server）

`@kikojs/dom/server` 是服务端渲染入口：**导入本模块即注册 SSR 字符串运行时**（显式副作用 `setSSRRuntime`）。组件代码仍从 `@kikojs/dom` 导入 `jsx`/控制流组件，运行时自动把它们切到字符串模式；客户端 bundle 不导入本模块，SSR 代码可 tree-shake 剔除。

## 推荐入口：renderToPage

把「请求作用域 + 信号捕获 + 渲染 + 序列化状态」收进一次调用，顺序错一步就会静默丢状态，默认走它：

```tsx
/** @jsxImportSource @kikojs/dom */
import { renderToPage } from "@kikojs/dom/server"

const { html, stateScript } = await renderToPage(() => (
  <main>
    <p>{count}</p>
    <Show when={visible} fallback="empty">
      <For each={items}>{item => <li>{item}</li>}</For>
    </Show>
    <Suspend fallback={<p>加载中…</p>}>
      <Card />
    </Suspend>
  </main>
))

return new Response(`<div id="root">${html}</div>${stateScript}`, {
  headers: { "content-type": "text/html; charset=utf-8" },
})
```

需要片段或流式时才用底层原语：

```tsx
import { renderToFragment, renderToStream, withSSRScope } from "@kikojs/dom/server"

const fragment = await renderToFragment(() => <App />) // Promise<string>，整棵树 resolve

const stream = renderToStream(() => <App />, { signal: req.signal }) // ReadableStream<string>
return new Response(stream, { headers: { "content-type": "text/html" } })
```

- 渲染函数必须接收 **thunk**（`() => <App/>`）：SSR 要先装好当前请求作用域再执行组件。
- `renderToStream` 的 TTFB 更低（同步骨架立即 flush，异步叶 resolve 后补发）；`options.signal` abort 后在下一个 await 边界停止并以 `signal.reason` 报错，不静默截断。
- **流式模式下 scoped `<Style>` 被丢弃并告警**（scope 属性无法回溯；不降级为全局以免泄漏）——需要 scoped CSS 请用 `renderToFragment`/`renderToPage` 或 `<Style global>`。

## 并发安全：withSSRScope

SSR 运行时与信号捕获/恢复槽位是进程级单实例。**并发 SSR（HTTP 服务每请求一段）必须各自包进 `withSSRScope`**，否则请求 A 的信号值会串进请求 B 的序列化载荷。可嵌套，内层继承外层。

```ts
import { withSSRScope, renderToFragment, startSignalCapture, serializeSignals } from "@kikojs/dom/server"

app.get("/", () =>
  withSSRScope(async () => {
    startSignalCapture()
    const html = await renderToFragment(() => <App />)
    const signals = serializeSignals()
    return page(html, signals)
  }),
)
```

`renderToPage` 已内含 `withSSRScope` + 捕获，直接调用 `renderToFragment`/`renderToStream` 时需自行包裹。串行使用无需包裹。

## 信号序列化（SSR → 水合状态传递）

```tsx
// 服务端
import { renderToPage } from "@kikojs/dom/server" // stateScript 即 <script id="kiko-state" type="application/json">…</script>

// 客户端：hydrate 自动读取页面内 <script id="kiko-state"> 并恢复，无需额外调用
import { hydrate } from "@kikojs/dom"
hydrate(() => <App />, document.getElementById("root")!)
```

按端拆分的底层 API：

- server 入口：`startSignalCapture()` / `stopSignalCapture()` / `serializeSignals()`（envelope `{"v":1,"s":[...]}`）/ `signalStateScript()` / `setSignalStateCodec()`
- 主入口（客户端）：`restoreSignals(state)` / `stopSignalRestore()` / `setSignalStateCodec()`；`hydrate(root, el, { state })` 可显式传入 envelope 或 JSON 字符串

限制与注意：

- 仅捕获**捕获窗口内**经 `@kikojs/dom` 的 `createSignal` 创建的信号（下标 = 创建顺序）；`computed` 不捕获，模块级 signal（窗口外）不捕获，`<Suspend>` 内 await 之后创建的信号不恢复。
- 默认 JSON 语义：不支持 undefined/Date/Map/Set/类实例/循环引用（开发模式会 `console.error` 并在 envelope 标记）。需要类型保真时两端各注册一半 codec：

```ts
import { setSignalStateCodec } from "@kikojs/dom/server" // 客户端从 @kikojs/dom 导入
setSignalStateCodec({ encode: v => /* ... */, decode: v => /* ... */ })
```

- 请求态（cookie / 登录）：在外层读 `req.headers`，以 props 传进组件树；渲染期间创建的 `createSignal(会话初值)` 会被捕获，客户端水合后首帧即登录态。**请求相关状态不要放模块级 signal**（跨请求污染且不会被序列化）。

## 客户端水合

```tsx
import { hydrate } from "@kikojs/dom"

const stop = hydrate(() => <App />, document.getElementById("app")!)
// options.state：显式状态；options.strict：错位从 console.error 升级为 throw（测试/CI）
```

`hydrate` 需要 SSR 端输出可对齐，已处理的边界：

- **相邻文本合并**：SSR 端 `["count = ", count]` 的相邻文本会被 HTML 解析合并，水合端做前缀匹配 + `splitText` 保证「一个值 = 一个节点」。
- **Show 分支切换**：水合后的 children/fallback 是 PendingNode，信号驱动切换时重建。
- **For**：初次按游标采纳现有节点，此后与客户端共用同一 ForCore 引擎。
- **ErrorBoundary**：静态采用，出错时客户端侧接管。
- **Suspend / 未决 lazy**：先静态采用既有节点，settle 后替换；迟到结果丢弃。
- **信号值失配**：以客户端值回填并 `console.error("[kiko hydrate] text mismatch: ...")` 告警。
- 采纳游标是模块级单实例：一次 hydrate 必须同步完成，不能并发/嵌套多个根。

## SSR 端行为速查

- 信号取当前快照（SSR 无响应式）；props / children 中的信号均支持。
- `Suspend` 等待 promise 后再输出；reject 时 `reportError` 并渲染 fallback；`lazy` 模块自然可用。
- scoped `Style` 的 scope 属性挂到最近祖先元素，与客户端语义一致。
- **事件处理器被丢弃**（无法序列化）；`ref` / `key` 忽略；`createPortal` / `render` / `ReactPortal` 在 SSR 不可用。
- `NoSSR` 只输出 fallback 骨架，children 在服务端永不执行（见 `kiko/control-flow`）。
