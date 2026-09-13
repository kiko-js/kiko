---
name: kiko/control-flow
description: >-
  @kikojs/dom 的控制流组件：Show（条件渲染）、For（列表——默认按条目身份复用，
  显式 keyed 用访问器信号）、ErrorBoundary（捕获渲染同步错误、可 reset）、
  Suspend（异步挂起、序列超车）、NoSSR（SSR 抠洞、客户端水合后填充）、
  lazy（懒加载模块）。SSR 与水合路径自动切换。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/dom-rendering
---

# 控制流（@kikojs/dom）

`Show`/`For`/`ErrorBoundary`/`Suspend`/`NoSSR`/`lazy` 构建在信号 + 标记锚点上。组件函数只执行一次，切换由内部信号驱动，SSR/水合路径自动选择。

## Show：条件渲染

```tsx
import { Show } from "@kikojs/dom"

<Show when={user} fallback={<p>loading</p>}>
  <h1>已登录</h1>
</Show>

<Show when={user}>{u => <h1>{u.name}</h1>}</Show> // 需要 when 的值时用函数 children
```

- `when` 可为信号或值；**只有信号才订阅更新**（`when={count.get() > 0}` 是快照）。
- falsy 判定为 SolidJS 风格：`false`/`null`/`undefined`/`""`/`0` 渲染 `fallback`。
- 静态 children/fallback 缓存同一批节点，换出保留 watcher、换回复用；函数 children 每次 `when` 变化重跑并接收真值。

## For：列表渲染

```tsx
import { For } from "@kikojs/dom"

// 默认（无 getKey）：按条目身份（SameValueZero）复用——对象移动/重排不重建
<For each={items}>
  {(item, index) => <li>{item.name}: {index()}</li>}
</For>

// 显式 keyed：children 收到 item 访问器，原位更新不重跑
<For each={items} getKey={i => i.id}>
  {(item, index) => <li>{item().name}: {index()}</li>}
</For>
```

- **默认即按身份复用**：同一对象换位 → DOM 节点被移动、children 不重跑；children 收到**值**，index 是 `() => i`（非响应式）。
- **重复身份**（同一引用出现两次，或重复原始值如 `["a","a"]`）会坍缩 → 自动回退整表重建（正确但无复用）。需要避免时用 `getKey`。
- **显式 `getKey`**：同 key 节点复用，children 至多执行一次；children 收到 `item: () => T` 访问器（读取才追踪）与响应式 index 访问器；原位替换 item 时节点不重建、绑定就地更新。

## ErrorBoundary：错误边界

```tsx
import { ErrorBoundary } from "@kikojs/dom"

const view = (
  <ErrorBoundary fallback={e => <p>{String(e)}</p>} onError={console.error}>
    <Expensive />
  </ErrorBoundary>
)
```

- children 可直接写组件（惰性占位），也可传 `() => node` thunk：**thunk 形态在 reset 后会重跑组件体**，裸形态复用同一批节点。
- **只捕获渲染路径的同步错误**（初始挂载 + 信号驱动重渲染）；事件处理器 / 异步回调中的错误不捕获，走宿主 `reportError`。
- 出错后 `errorSignal` 记录错误、`onError` 被调用并渲染 `fallback`；写入 `resetSignal`（需是**不同**的值，如计数器）触发重试。
- `fallback` 为函数时每次按错误重建；静态 fallback 缓存复用。

## Suspend：异步挂起

```tsx
import { Suspend, lazy } from "@kikojs/dom"

const view = (
  <Suspend fallback={<p>加载中…</p>}>
    <Card />
  </Suspend>
)
```

- children 可为：promise / 含 promise 的数组 / 值为 promise 的信号 / 普通节点。
- 挂起时先渲染 `fallback`，全部 settle 后换入结果；**序列超车**：信号变化时旧请求的迟到结果被丢弃并清理，不覆盖新内容。
- 任一 promise reject → `reportError` 且保持 `fallback`；Suspend 之外的 Promise 会抛错。
- 组件只执行一次，Suspend 只适合**一次性初始化**；需要响应式刷新用 `effect` 或 `Show`。

## NoSSR：静态页抠洞

```tsx
import { NoSSR } from "@kikojs/dom"

const view = (
  <NoSSR
    fallback={
      <ul>
        <li class="skeleton">骨架屏…</li>
      </ul>
    }
  >
    <Timeline /> {/* 服务端不执行，水合后客户端填充 */}
  </NoSSR>
)
```

- **SSR**：只输出 `fallback`，children 在服务端永不执行（不占信号槽、不调浏览器 API）。
- **水合**：先采纳骨架，微任务后换入真实 children；宿主在填充前 dispose 会取消填充并保留骨架。
- **纯客户端**：直接渲染 children。children 可直接写组件；洞内异步内容自行包 `<Suspend>`。

## lazy：懒加载模块

```tsx
import { lazy } from "@kikojs/dom"

const Card = lazy(() => import("./Card").then(m => m.default))
// 测试：lazy(() => Promise.resolve(() => <div class="card">card</div>))
```

- 返回 `AsyncComponent<P>`：加载中渲染占位，加载完成渲染真实组件；并发调用共享同一次加载，失败会清缓存以便重试。
- 通常与 `Suspend` 组合；SSR 端等待模块解析后再输出。

## SSR / 水合

每个组件在 `isHydrating()` 时走水合路径，服务端走字符串路径，客户端走 DOM 路径（运行时自动路由）：

- `Show`：SSR 输出与客户端首帧一致（falsy → fallback）。
- `For`：按 key 对齐节点；水合采纳的节点同样复用。
- `Suspend` / 未决 `lazy`：先静态采用既有节点，settle 后替换；迟到结果直接丢弃。
- `ErrorBoundary`：静态采用，出错时客户端侧接管。
- `NoSSR`：SSR 骨架 → 水合后填充。
- 流式 SSR 下 scoped `<Style>` 被丢弃并告警（见 `kiko/ssr`）。

## 陷阱

- 不要依赖组件函数重跑来更新控制流——把条件/数据做成信号。
- `Show` 的 `when` 传 boolean 表达式会失去响应性；传信号或 `computed`。
- 控制流组件返回 `DocumentFragment`，锚点为注释标记。
