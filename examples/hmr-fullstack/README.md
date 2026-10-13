# kiko HMR 示例 · 全栈

一个 Bun 进程同时提供**前端 SPA** 与**后端 API** 的全栈示例，演示两端各自的热更新。
纯前端版本见 [`examples/hmr-spa`](../hmr-spa/README.md)。

| 改动的文件                                                       | 热更新方式                                       | 效果                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| `src/app.tsx` `src/counter.tsx`                                  | Bun 打包器 HMR（`import.meta.hot`）+ kiko 注册表 | 组件原位热替换，计数 / 已拉取的数据保留                |
| `src/store.ts`                                                   | 模块作用域信号复用                               | 模块级信号身份与值都保留                               |
| `src/server/db.ts` `src/server/api.ts` `server.tsx` `index.html` | `bun --hot` 软重载 + `/hmr` 端点广播 `reload`    | 服务端模块不重启进程换新代码，浏览器整页刷新拿到新行为 |

## 运行

```bash
bun install      # 仓库根目录，安装 workspace 依赖
cd examples/hmr-fullstack
bun run dev      # bun --hot server.tsx → http://localhost:3004
```

## 试一下

1. 点几次 `+1`，再添加几条待办。
2. 编辑 `src/app.tsx` 或 `src/counter.tsx`：**页面不刷新**，计数和待办列表都还在。
3. 编辑 `src/store.ts`（例如给 `status` 换个初始值）：模块级信号按「模块 + 创建序」复用旧对象，当前数据不丢。
4. 编辑 `src/server/db.ts`（例如往 `todos` 里加一条种子数据）：
   - 终端打印 `[hmr] server changed: src/server/db.ts → reload`；
   - 浏览器自动整页刷新，「服务端求值时间」变化、种子数据更新——`bun --hot` 确实重新求值了服务端模块，而不是重启进程。
   - 也可以在终端直接看 API：`curl -s localhost:3004/api/board`。

## 结构

```
examples/hmr-fullstack/
├── index.html         前端骨架：<div id="app"> + module script
├── server.tsx         Bun.serve：前端 HTML import + /api/* + /hmr + 服务端文件监听
├── bunfig.toml        [serve.static] plugins = ["@kikojs/hmr/bun"]
├── tsconfig.json      jsxImportSource: "@kikojs/dom"
└── src/
    ├── main.tsx       客户端入口：render(<App />)
    ├── app.tsx        顶层组件（拉取 /api/board，Show + For 渲染）
    ├── counter.tsx    组件内部信号（热替换后按创建序恢复）
    ├── store.ts       客户端模块级信号 + API 调用
    └── server/        仅服务端模块：浏览器 bundle 里不存在
        ├── db.ts      内存「数据库」+ 求值时间
        └── api.ts     路由处理器（标准 Request/Response）
```

## 原理

- **前端一半**：`routes: { "/*": html }` + `development: { hmr: true }`。Bun 打包
  `index.html` 引用的 TSX，`@kikojs/hmr/bun` 插件（`bunfig.toml`）把顶层组件改写成
  注册表包装并注入 `import.meta.hot.accept`：保存组件文件时由打包器重求值并回调，
  kiko 注册表原位换掉组件、迁移信号状态。
- **后端一半**：dev 脚本用 `bun --hot`。Bun 监听入口模块图里的所有服务端文件，保存后
  「软重载」——重新求值模块并替换 `Bun.serve` 的处理器，进程、端口和连接都不重启
  （模块级变量会重置，`globalThis` 保留）。
- **两端之间的桥**：服务端模块不在浏览器 bundle 里，打包器 HMR 看不到它们。所以
  `server.tsx` 用 `createPathWatcher`（`@kikojs/hmr/watcher`）监听服务端源码、
  `server.tsx` 与 `index.html`，变化时通过 `createBunHmr` 的独立 `/hmr` 端点
  （SSE，插件注入的客户端默认连它）广播 `reload`，浏览器整页刷新。
  `bun --hot` 会重新求值 `server.tsx`，因此 Hub 与 watcher 挂在 `globalThis` 上只
  创建一次；否则每次保存都会叠一套监听。
- `/api/*` 处理器接收标准 `Request`、返回标准 `Response`，不依赖 Bun 专有 API，方便
  换到别的 Fetch 宿主。
- **入口 accept 边界（必需）**：Bun 的 HMR 图包含 monorepo 内经 tsconfig `paths`
  解析到项目根之外的框架源码（`../../packages/dom/src/*`），这些模块每次更新都会被
  判为「未接受」并把整页刷新冒泡到 HTML 入口——那样客户端热替换就退化成整页刷新、
  状态全丢。`src/main.tsx` 里的 `if (import.meta.hot) import.meta.hot.accept(() => {})`
  让冒泡终止；组件模块自己的 accept 回调照常原位热替换。
- **客户端连 `/hmr` 走 WebSocket**（`index.html` 里 `globalThis.__KIKO_HMR__ = { transport: "ws" }`）：
  服务端 `bun --hot` 软重载时 SSE 响应流会被释放（Bun 打印 `Reader released`），
  WebSocket 长连接不受影响，`reload` 能正常送达。

> 本示例面向开发期。生产构建可以用 `bun build --target=bun server.tsx`（HTML import
> 会解析为预打包清单）或直接 `bun run server.tsx`，此时 `import.meta.hot` 相关代码
> 不参与。
