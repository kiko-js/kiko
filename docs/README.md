# kiko 文档站

官网源码，静态 HTML + Bun 构建，部署到 GitHub Pages。

## 目录结构

```
docs/
├── index.html      首页：特性、文档地图、实时 demo、快速开始
├── guide.html      指南：设计理念 → 安装 → 上手 → 响应式 → 样式 → 生态
├── signal.html     @kikojs/signal API 参考
├── dom.html        @kikojs/dom API 参考
├── router.html     @kikojs/router API 参考
├── examples.html   示例：实时 demo + 代码 + 本地示例项目
├── api.html        旧链接重定向（→ guide.html）
├── build.ts        构建脚本（bun run docs/build.ts）
├── tsconfig.json   type-check 代码片段（assets/**）
├── package.json    workspace 成员（依赖三个 @kikojs/* 包，用于片段类型检查）
└── assets/
    ├── style.css   站点样式
    ├── highlight.js 代码高亮 + data-src 片段加载
    ├── counter.ts  首页 / 示例页实时计数器 demo
    ├── htm.ts      示例页 htm demo
    └── snippets/   所有代码片段（页面通过 data-src 加载，单一事实来源）
```

## 约定

- **代码示例统一放在 `assets/snippets/`**，页面用
  `<pre><code class="language-tsx" data-src="./assets/snippets/foo.tsx">` 引用。
  片段是真实 TS/TSX 文件，会被 `bunx tsc --noEmit -p docs/tsconfig.json` 类型检查，
  保证文档代码始终与真实 API 一致。片段用到可选依赖（如 htm）时，把该依赖加到
  `docs/package.json` 的 devDependencies。
- 单行 shell 命令（如 `bun add ...`）直接内联，不走 data-src。
- 页面导航使用 `aria-current="page"` 标记当前页（样式见 style.css）。
- 所有 HTML 必须是可解析的闭合标记（oxfmt 会在提交钩子中格式化）。

## 本地开发

```bash
# 类型检查所有代码片段（推荐在修改 snippets 后运行）
bunx tsc --noEmit -p docs/tsconfig.json

# 构建站点到 dist/（必须从仓库根目录运行）
bun run docs/build.ts

# 本地预览
bunx serve dist
```

构建产物在 `dist/`（已 gitignore），由 GitHub Actions 部署到 GitHub Pages。
