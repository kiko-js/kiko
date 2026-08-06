---
name: kiko/control-flow
description: >-
  @kikojs/dom 的控制流组件：Show（条件渲染）、For（列表，keyed 与
  non-keyed，index 为访问器信号）、ErrorBoundary（错误边界）、Suspend
  （异步组件，序列超车）、lazy（懒加载模块）。SSR 与水合路径自动切换。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/dom-rendering
---

# 控制流（@kikojs/dom）

`Show`/`For`/`ErrorBoundary`/`Suspend`/`lazy` 构建在信号 + 标记锚点上。组件函数只执行一次，切换由内部信号驱动，SSR/水合路径自动选择。

## Show：条件渲染

```tsx
import { Show } from "@kikojs/dom"

;<Show when={user.get()} fallback={<p>loading</p>}>
  {u => <h1>{u.name}</h1>} // children 可为函数，接收 truthy 的 when 值
</Show>
```

- `when` 可为信号或值；falsy（false/null/""/0）渲染 `fallback`，truthy 渲染 `children`。
- `children` 为函数时接收 truthy 值（空/undefined 分支不调用）。
- 客户端首帧与 SSR/水合分支一致（falsy 时渲染 fallback）。

## For：列表渲染

```tsx
import { For } from "@kikojs/dom"

// keyed：按 getKey 复用节点，索引变化更新对应项
<For each={items} getKey={i => i.id}>
  {(item, index) => <li>{item.name}: {index()}</li>}
</For>

// non-keyed（不传 getKey）：each 变化整列重渲
<For each={items}>
  {(item, index) => <li>{item}: {index()}</li>}
</For>
```

- 推荐 keyed：同 key 节点复用，只更新变化的项。
- **index 是访问器（`() => number`）**，其背后是 `Signal.State`——在 `Signal.Computed` 里读取 index 也能正确响应（普通字段值不可见，见 store 语义）。同对象引用重排时 index 信号仍正确更新。
- children 为函数 `(item, index) => node`，每次渲染按需重跑。

## ErrorBoundary：错误边界

```tsx
import { ErrorBoundary } from "@kikojs/dom"

;<ErrorBoundary fallback={e => <p>{String(e)}</p>} onError={console.error}>
  <Expensive />
</ErrorBoundary>
```

- `children` 是**函数** `() => node`；内部抛错 → 渲染 `fallback`（可为函数，接收 error）。
- `onError` 被调用；若 `onError` 本身抛错会继续向上冒泡。
- 出错后可通过内部 reset 恢复（重新渲染子树）。

## Suspend：异步组件

```tsx
import { Suspend, lazy } from "@kikojs/dom"

;<Suspend fallback={<p>加载中…</p>}>
  <AsyncComp />
</Suspend>
```

- children 中出现 thenable（Promise / async 组件）时先渲染 `fallback`，解析后替换。
- **序列超车**：后来的请求胜出，旧请求迟到结果不覆盖。
- 支持信号化的 children 数组（混入信号项）。

## lazy：懒加载模块

```tsx
import { lazy } from "@kikojs/dom"

const Card = lazy(() => import("./Card").then(m => m.default)) // 真实用法
// 测试/演示：lazy(() => Promise.resolve(() => <div class="card">card</div>))
```

- 返回 `AsyncComponent<P>`：加载中渲染占位，加载完成渲染真实组件。
- 通常与 `Suspend` 组合（fallback 接管加载态）；SSR 端会等待模块解析后再输出。

## SSR / 水合

每个组件在 `isHydrating()` 时走水合路径，服务端走 SSR 字符串路径，客户端走 DOM 路径（由 `@kikojs/dom` 运行时自动路由）。跨端行为：

- `Show`：SSR 输出与客户端首帧一致（falsy → fallback）。
- `For`：keyed 水合按 key 对齐节点。
- `Suspend`：SSR 端 promise 未决时输出 fallback；水合端对未决 lazy 做静态采用，直到模块 settle 后替换（见 `kiko/ssr`）。
- `ErrorBoundary`：水合为静态采用，出错时客户端侧接管。

## 陷阱

- 不要依赖组件函数重跑来更新控制流——把条件/数据做成信号。
- keyed `For` 复用节点时，节点内部对 item 的响应式来自 per-key 状态，重排后 item 更新不重建节点。
- 控制流组件返回 `DocumentFragment`，用于占位/分支切换。
