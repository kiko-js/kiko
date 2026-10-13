# kiko HMR 示例 · 纯前端 SPA

`@kikojs/dom` + `@kikojs/signal` 构成的**纯前端**单页应用，用 Bun 开发服务器
运行：没有服务端路由、没有 API、没有 SSR——整个项目就是浏览器里的一份 SPA，
用来演示最直接的「前端热更新」：编辑组件文件，页面不整页刷新，状态不丢。

全栈版本（客户端 + 服务端 API + 服务端模块热重载）见
[`examples/hmr-fullstack`](../hmr-fullstack/README.md)。

## 运行

```bash
bun install      # 仓库根目录，安装 workspace 依赖
cd examples/hmr-spa
bun run dev      # http://localhost:3003
```

## 试一下热更新

1. 先把两个计数器点到不同的数字，再点几次 `Shared +1`。
2. 编辑 `src/counter.tsx`（例如把 `+1` 改成 `+2`）：组件**原位热替换**，
   两个计数器的计数都保留。
3. 编辑 `src/store.ts`（例如把 `createSignal(0)` 改成 `createSignal(100)`）：
   模块级信号按「模块 + 创建序」复用旧信号对象，当前值不会被重置，`doubled`
   计算属性继续跟着走。
4. 编辑 `src/app.tsx`：顶层组件用新实现重跑，子组件实例按创建序认领，
   `Counter A` / `Counter B` 的状态仍在。
5. 编辑 `index.html` 的样式或文案：HTML 开发模式下每次请求重新打包，
   刷新页面即可看到（HTML 是骨架，不在 HMR 边界内）。

浏览器控制台会打印 HMR 连接状态；终端里能看到浏览器 `console` 的回显。

## 生产构建

```bash
bun run build    # 输出到 examples/hmr-spa/dist，交给任意静态托管
```

构建走的是普通 `Bun.build`，不加载 HMR 插件——产物里没有 `import.meta.hot`
粘合，也没有 HMR 客户端。

## 结构

```
examples/hmr-spa/
├── index.html        页面壳：<div id="app"> + module script
├── server.ts         Bun.serve：HTML import + development.hmr + /hmr 端点
├── bundler.ts        Bun.build 静态构建（生产）
├── bunfig.toml       [serve.static] plugins = ["@kikojs/hmr/bun"]
├── tsconfig.json     jsxImportSource: "@kikojs/dom"
└── src/
    ├── main.tsx      客户端入口：render(<App />)
    ├── app.tsx       顶层组件（热替换边界 + 子组件认领）
    ├── counter.tsx   组件内部信号（按创建序恢复旧值）
    └── store.ts      模块级信号（身份与值保留）
```

## 原理

- `bunfig.toml` 的 `[serve.static] plugins` 启用 `@kikojs/hmr/bun`：Bun 在给
  HTML import 打包时，把 `src/` 下的顶层 PascalCase 组件改写成
  `__kiko_hmr.ref(moduleId, name, impl)` 注册表包装，并给组件模块注入
  `import.meta.hot.accept` 粘合。
- `development: { hmr: true }` 让 Bun 打包器负责模块替换：保存文件后重新求值
  变化的模块并回调 accept，kiko 的注册表据此原位换掉组件、迁移信号状态。
- `createBunHmr()` 提供的 `/hmr` 独立端点（SSE / WebSocket）是插件注入的客户端
  默认连接目标。纯 Bun 宿主下更新由打包器应用（`managed`），端点不参与替换；
  换到没有 bundler HMR 的宿主时，给 `createBunHmr({ watch: ["src"] })` 打开
  文件监听，端点就会按模块 URL 重新导入模块。
- `src/main.tsx` 里的空 accept 回调是一个必要的边界：Bun 的 HMR 图包含
  monorepo 内经 tsconfig `paths` 解析到项目根之外的框架源码
  （`../../packages/dom/src/*`），这些模块每次更新都会被判为「未接受」并把整页
  刷新冒泡到 HTML 入口。入口 accept 之后冒泡终止，组件模块自己的 accept 回调
  照常原位热替换。编辑入口文件本身不会生效（回调为空），刷新页面即可。
