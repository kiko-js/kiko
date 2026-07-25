# kiko

一个基于 [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill) 的细粒度响应式 DOM 库。JSX 直接编译为真实 DOM，组件函数只执行一次。

## 包

- `@kikojs/signal` — 信号原语、computed、effect、batch、untrack、on、emitter
- `@kikojs/dom` — JSX 工厂、render、Show / For / ErrorBoundary、React 桥接

## 文档与示例

访问项目官网：**https://kiko-js.github.io/kiko/**

官网源码位于 `docs/` 目录，使用 GitHub Actions 部署到 GitHub Pages。

## 本地开发

```bash
bun install
bun test
```

## 许可证

MIT
