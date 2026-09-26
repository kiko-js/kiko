# kiko SPA 示例

`@kikojs/dom` + `@kikojs/signal` + `@kikojs/router` 的完整单页应用，用 Bun
开发服务器运行（HTML imports 直接打包 TSX，无需额外构建配置）。

对应文档站教程页：[`docs/tutorial.html`](../../docs/tutorial.html)。

## 运行

```bash
bun install                 # 仓库根目录，安装 workspace 依赖
cd examples/spa
bun run dev                 # http://localhost:3000
```

打开 http://localhost:3000，或直接访问深链接 http://localhost:3000/users/42
（`routes: { "/*": html }` 让任意路径都回落同一份 HTML）。

## 生产构建

```bash
bun run build               # 输出到 examples/spa/dist
```

## 结构

```
examples/spa/
├── index.html          页面壳：<div id="app"> + module script
├── server.ts           Bun.serve + HTML import（开发服务器）
├── bundler.ts          Bun.build 静态构建
├── tsconfig.json       jsxImportSource: "@kikojs/dom"
└── src/
    ├── main.tsx        入口：render(<Router><App /></Router>)
    ├── app.tsx         外壳：导航 Link + Outlet + scoped <style>
    ├── routes.tsx      路由表 + createRouter
    ├── store.ts        模块级 signal 状态（任务列表）
    └── pages/          首页 / 任务 / 用户 / 404
```

> 教程页展示的代码片段与 `src/` 保持同步（见 `docs/assets/snippets/tutorial/`），
> 修改任一处时请同步另一处。
