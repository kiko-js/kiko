---
name: kiko/hmr
description: >-
  @kikojs/hmr 开发期热更新：React Fast Refresh 语义（组件原位替换、组件内部与
  模块级信号状态保留）。通信层是独立 /hmr 端点（路径可配），纯 Fetch API、
  框架无关，支持 SSE / WebSocket；提供通用 Hub、客户端、模块改写 transform、
  文件 watcher，以及 Bun（打包插件 + Bun.serve 适配）与 Node 两个接入入口。
type: sub-skill
library: kiko
requires:
  - kiko
  - kiko/dom-rendering
---

# HMR（@kikojs/hmr）

把 HMR 拆成**通用核心** + **接入方式**。核心 Hub 不解析请求路径、不认传输、不依赖框架，只依赖 Fetch API（`Request` / `Response` / `ReadableStream`）；更新事件由宿主 `publish()` 推入。浏览器连到 `/hmr`（路径可配），SSE 或 WebSocket 接收更新；组件被改写为注册表包装，原地热替换且状态保留。

## 入口

| 入口                    | 内容                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `@kikojs/hmr`           | 通用核心：协议、`createHmrHub`、`connectHmr` / `ensureHmrClient`、注册表运行时（浏览器 / SSR 安全） |
| `@kikojs/hmr/client`    | 浏览器侧（客户端 + 注册表应用层），插件注入的胶水使用它                                             |
| `@kikojs/hmr/server`    | 仅服务端 Hub / 协议（不含浏览器客户端）                                                             |
| `@kikojs/hmr/transform` | 通用模块改写 `transformForHmr`（依赖 `oxc-parser`）                                                 |
| `@kikojs/hmr/watcher`   | 通用递归文件监听 `createPathWatcher` / `toModuleId`                                                 |
| `@kikojs/hmr/bun`       | Bun 接入：打包插件 `kikoHmr` + `createBunHmr`                                                       |
| `@kikojs/hmr/node`      | Node 接入：`createNodeHmr` / `toNodeListener` / `bindSocket`                                        |
| `@kikojs/dom/hmr`       | DOM 宿主接线层（注入 `HmrDomAdapters` 并安装全局注册表），插件默认 runtimeModule                    |

## Bun 接入

`bunfig.toml` 启用打包插件（把顶层组件改写为注册表包装并注入端点胶水）：

```toml
[serve.static]
plugins = ["@kikojs/hmr/bun"]
```

```ts
import { createBunHmr } from "@kikojs/hmr/bun"

const hmr = createBunHmr({ watch: ["src"], debounceMs: 30 })

Bun.serve({
  development: { hmr: true }, // Bun 自带模块替换；独立端点负责通知 / 非 Bun 宿主
  fetch: (request, server) =>
    hmr.fetch(request, server) ?? new Response("Not Found", { status: 404 }),
  websocket: hmr.websocket,
})

// watcher 之外也可手动推送
hmr.publish(["src/app.tsx", "src/store.ts"])
hmr.reload("module graph changed")
```

## Node 接入

Node 没有内置 bundler，也不提供 `import.meta.hot`：`createNodeHmr` 提供纯 Fetch API 的 `fetch`，`toNodeListener` 桥接 `node:http`，`bindSocket` 把 EventEmitter 风格 WebSocket 接进同一 Hub；改写后的模块由端点驱动（`managed: false`）按模块 URL 重新导入。

```ts
import { createServer } from "node:http"
import { createNodeHmr, toNodeListener } from "@kikojs/hmr/node"

const hmr = createNodeHmr({ watch: ["src"] })

createServer(
  toNodeListener(hmr, {
    fallback: (_req, res) => {
      res.statusCode = 404
      res.end("Not Found")
    },
  }),
).listen(3000)
```

## 通用 Hub（任意 Fetch 宿主）

```ts
import { createHmrHub, type HmrSink } from "@kikojs/hmr"

const hub = createHmrHub({ heartbeatMs: 15000 })
// GET /hmr → SSE；POST /hmr → 客户端消息。路径由宿主自己判断，Hub 不认识路径。
export default {
  fetch: (request: Request) =>
    new URL(request.url).pathname === "/hmr" ? hub.handle(request) : new Response("Not Found"),
}

const sink: HmrSink = {
  send: data => {
    /* 任意长连接 */
  },
}
const unsubscribe = hub.subscribe(sink)
hub.publish("src/app.tsx")
unsubscribe()
```

`HmrHub` 成员：`size`、`subscribe(sink)`、`publish(modules)`、`reload(reason?)`、`receive(data, sink?)`、`handle(request)`、`close()`。

## 客户端与协议

插件注入的胶水会自动 `ensureHmrClient()` 连接端点；也可手动：

```ts
import { connectHmr } from "@kikojs/hmr/client"

const client = connectHmr({ transport: "auto" }) // "sse"（默认）| "ws" | "auto"（ws 优先，失败回落 sse）
client.on("update", m => console.log("modules changed", m.modules))
client.on("reload", m => location.reload())
client.send({ type: "hello", version: 1 })
client.close()
```

宿主可在模块脚本前设 `globalThis.__KIKO_HMR__ = { url: "/hmr", transport: "ws" }` 配置端点与传输。协议为带 `type` 的 JSON：服务端 → `connected`/`update`/`reload`/`ping`，客户端 → `hello`/`pong`（SSE 单向，客户端消息自动走 POST）。

## 模块改写与状态保留

`transformForHmr(path, source, moduleId, { bundler })` 基于 `oxc-parser` AST span 做文本拼接：

- 顶层 PascalCase 组件（函数声明 / const 箭头与函数表达式 / 默认导出）注册为 `__kiko_hmr.ref(moduleId, name, impl)`，引用在调用期解析到稳定包装。
- 注入 `beginModule` / `endModule`（模块级信号作用域）与 `acceptHmrModule(moduleId, { url, managed })`。
- `bundler: "bun"` 额外注入 `import.meta.hot.accept` 粘合；`false`（Node 等）由端点驱动重新导入。生产构建中粘合代码被 bundler 消除。

状态保留：组件内部信号按创建序 + 类型指纹恢复旧值；模块级信号按「模块 + 创建序」复用旧信号对象（身份与值都保留）；更新批次内父级 remount 按创建序认领同 key 实例，子组件状态不丢；本轮未重新注册的组件被卸载并清理 watcher。

## 陷阱

- **`root` / `cwd` 必须与插件和 Hub 一致**：打包插件只改写根目录内的项目源码（node_modules 与经 tsconfig `paths` 解析到根外的框架源码不改写，否则会与框架内部模块形成循环依赖），且模块 id 以 `relative(cwd, file)` 规范化——两边不一致会导致 watcher 发布的 id 对不上。
- **moduleId 是不透明字符串**，核心不要求它是文件路径；路径路由由接入层负责，核心从不硬编码 `/hmr`。
- **Bun 自带 HMR 时不重复替换**：有 `import.meta.hot` 的模块交给 bundler 的 accept 回调，端点只通知；无 bundler HMR 的宿主才由端点按模块 URL 重新导入。
- 客户端是全局单例（`Symbol.for("kiko:hmr:client")`），注册表也是全局单例（`Symbol.for("kiko:hmr")`，`installHmr` 幂等）；测试可用 `resetHmrClient()` 重新接线。
- 生产构建靠 `process.env.NODE_ENV` 守卫 DCE 掉 HMR 代码（`render` 的 scope 包裹等）。

## 参考

`examples/hmr`（`bun run dev`，默认 `http://localhost:3003`）：编辑组件文件热替换且计数保留、编辑模块信号文件身份保留、编辑入口重渲染并认领实例。API 参考见 `docs/src/pages/hmr.tsx`。
