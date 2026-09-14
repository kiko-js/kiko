# @kikojs/hmr

## 0.2.0

### Minor Changes

- ### @kikojs/router (patch)
  - **router**: Link 客户端分支走 jsx 追加 children，修复信号子节点渲染成 [object Object] (9fbdd60)
  - **router**: Outlet 换入时用 toNodes 解包 lazy 组件，修复 HMR 下路由切换空白 (4f46eb7)

  ### @kikojs/dom (patch)
  - **dom**: 水合期跳过 HMR 节点/信号接管，修复栈溢出与快照丢失 (1322c67)
  - **dom**: strip HMR hooks from production builds (e3872b6)

  ### @kikojs/hmr (minor)
  - **hmr**: stop rewriting non-project sources and drop afterUpdate glue (a2ada46)
  - **hmr**: split shared core from Bun/Node integrations (87c23ae)
  - **hmr**: standalone /hmr endpoint with SSE/WS and Bun fetch adapter (9d9829d)

## 0.1.0

### Minor Changes

- 1638d47: Initial release: renderer-agnostic HMR runtime (single-instance registry) plus the Bun adapter plugin (`@kikojs/hmr/bun`) with Vite-style `import.meta.hot` support.
