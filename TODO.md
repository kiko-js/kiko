# kiko 优化清单(TODO)

本文件记录三轮深度审查(`packages/signal` / `packages/dom` / `packages/router` + 工具链)后的**未完成项**。已落地的内容见文末「已完成」,可作 roadmap 跟踪。

---

## 🔴 第一梯队 —— 正确性 / 架构

### signal

| #   | 项目                                           | 位置               | 说明                                                                                                                                                     |
| --- | ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **嵌套 effect 无所有权,必然泄漏**              | `effect.ts`        | 外层 effect 每轮重跑创建的内层 effect 不会自动 dispose(Solid 式 owner 追踪缺失);`createResource` 靠手动 `onCleanup(dispose)` 才有。需 owner 追踪或文档化 |
| S2  | **store `get()` 返回活对象**                   | `store.ts:160-165` | `store.get().a = 5` 原地改根零通知;已创建的路径信号保留旧值 → 信号与根分叉,直到下次 `set` 自愈。修复:返回冻结快照,或读取时自愈信号                       |
| S3  | **store 数据键与 API 面冲突**                  | `store.ts:159-179` | `createStore({ get: 5 })` 时数据键 `get`/`set`/`signal`/`then` 不可达,无逃生口                                                                           |
| S4  | **非 plain 嵌套对象被 `{...}` 展开销毁**       | `store.ts:94-96`   | 不包 `ref()` 的 `Date`/`Map`/类实例在子孙写入时原型丢失(`{...d}` 拍成 `{}`)。修复:非 plain 自动视为 ref 终端,或明确抛错                                  |
| S5  | **store trie 无回收**                          | `store.ts`         | 动态键(`store.byId[id]`)创建的信号永不释放,长驻 store 累积内存                                                                                           |
| S6  | **computed 内允许写信号(不设防)**              | `computed.ts`      | polyfill `consumerAllowSignalWrites=true`,`computed(() => { s.set(1); return 1 })` 静默可用;需纯度守卫或文档化                                           |
| S7  | **onCleanup 在 computed 里求值串到外层 scope** | `scope.ts:17-19`   | computed 在 effect 内求值时 `onCleanup` 注册进 effect 的 scope,重求值累积重复清理                                                                        |

### router

| #   | 项目                                                     | 位置                          | 说明                                                                                                                                                      |
| --- | -------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **activeRouter 仍是模块级单例**                          | `context.ts`                  | 多 Router 共存(多应用/微前端/并行测试)互相覆盖;`setActiveRouter(null)` 清理可能误清他人。修复:接入 `@kikojs/dom` 的 `createContext`,按树作用域解析        |
| R2  | **hooks 返回快照值**                                     | `hooks.ts`                    | `useParams`/`useQuery`/`useLocation`/`useRoute` 在组件体内 `.get()` 一次即死值(kiko 组件不重渲染),导航后过期。修复:返回 accessor/信号,或文档化 + 类型提示 |
| R3  | **popstate 丢失 `history.state` + 拦截 bounce 无防重入** | `router.ts:236-252`           | 回退/前进后 `location.state` 为 undefined;守卫拦截时 `go(-1)` 无重入标志,拦截所有历史项时无限 bounce;`afterEach` 不在 popstate 触发                       |
| R4  | **异步守卫竞态**                                         | `router.ts:151-182`           | 两次快速导航无取消令牌,慢守卫后提交覆盖快守卫 → URL 与 location 不一致。修复:导航序号,丢弃过期 commit                                                     |
| R5  | **同地址去重缺失**                                       | `router.ts:173-178`           | 对当前 URL 重复 push 历史条目;任何 location 变化(含 query-only)都全量重渲染路由子树。修复:按 route+pathname 记忆化子树 + 同地址跳过                       |
| R6  | **Link href 模式/base 感知 + 用户 onClick 被覆盖**       | `components.tsx:62-102`       | hash 模式 href 应为 `#/about`;path 模式缺 base 前缀(中键/新标签/复制链接坏);`...rest` 展开后内部 onClick 覆盖用户传入的 onClick                           |
| R7  | **path 模式 base 前缀盲目裁剪**                          | `history.ts:41-46`            | base `/app` + URL `/apples` → 路径变成 `"les"`。需边界判断(`full === base                                                                                 |     | startsWith(base + "/")`) |
| R8  | **大小写不敏感匹配**                                     | `matcher.ts:61-62`            | `/Users` 匹配 `/users`,与 `pathsEqual` 语义矛盾。去掉 `i` 标志或文档化                                                                                    |
| R9  | **无 404/catch-all**                                     | `router.ts:96-99`             | matchAll 为空 → currentRoute null → Outlet 静默渲染空。需 `*` 兜底路由或显式 no-match 分支                                                                |
| R10 | **`normalizeGuardResult` 接受任意 truthy 对象**          | `router.ts:41-46`             | 守卫返回 `{}` → `commit(undefined)` → `resolveLocation` TypeError。需运行时校验形状                                                                       |
| R11 | **`createAuthGuard` 带 query 目标死循环**                | `guards.ts:10`                | 只比较 pathname,目标带 query 时循环到 `MAX_REDIRECT_DEPTH` 抛错                                                                                           |
| R12 | **`navigate()` 吞错**                                    | `router.ts:184-192`           | 调用方无法 await/重试被拦截的导航。需 promise 返回                                                                                                        |
| R13 | **功能缺口**                                             | `types.ts` / `components.tsx` | lazy 路由、路由数据加载、滚动恢复、focus 管理、search-params helpers、`useIsActive`/`useMatch`、index/pathless 布局路由、类型化参数、404                  |
| R14 | **`<Route>` 组件无操作 + README 用错**                   | `components.tsx:45-48`        | 渲染无操作注释,README 快速开始用 `<Route path component>` 什么都不做;`createRouter({mode})` 缺 routes 直接崩。与文档修复联动                              |

### dom

| #   | 项目                                        | 位置                     | 说明                                                                                                                  |
| --- | ------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| D1  | **水合版 ErrorBoundary fallback 未做保留**  | `hydrate.ts`             | 客户端版已保留,水合版 fallback 仍是动态清理;隐藏分支重挂载后内部绑定死亡(低频场景)                                    |
| D2  | **每绑定一个 Watcher + 一个微任务**         | `jsx-runtime.ts` 等      | 千级绑定 = 千级 watcher + 千个微任务。架构级优化:组件/根级共享 watcher + 脏标记批量处理(收益中等,改动大)              |
| D3  | **`cleanupWatchers` 深度递归**              | `jsx-runtime.ts:90-114`  | 极深 DOM 树有栈溢出风险,可迭代化                                                                                      |
| D4  | **keyed For 重排全量 detach/re-attach**     | `flow.ts`                | 加一项也动全部节点;应只移动位置变化的节点(SolidJS 做法)                                                               |
| D5  | **SSR `extractScopeMarkers` O(n×m)**        | `ssr.ts:97-109`          | 反复整串 indexOf + slice;单遍扫描可 O(n)                                                                              |
| D6  | **`toNodes` 数组每项新建 DocumentFragment** | `jsx-runtime.ts:125-127` | 复用单个 fragment 或直接追加                                                                                          |
| D7  | **`isAdopted` 线性扫 adoptedStyleSheets**   | `jsx-runtime.ts:86-88`   | Style 多时 O(n²);WeakSet 记账                                                                                         |
| D8  | **SSR 原始字符串注入面**                    | `ssr.ts:132,136`         | global/scoped `<style>` 的 css 未转义,`</style><script>` 可注入;需转义或校验闭合                                      |
| D9  | **`createPortal` 无 SSR 分支**              | `portal.ts:13`           | SSR 模式构造即触碰 document 崩溃;文档应注明仅客户端可用                                                               |
| D10 | **信号 props 不在 JSX 类型面**              | `jsx-types.ts`           | `class?: string` 等不接受 `Signal.State` —— `<div class={sig}>` 类型报错而运行时支持(运行时/类型不一致)               |
| D11 | **事件类型缺口 + 索引签名吞错**             | `jsx-types.ts`           | 缺 `onPointer*`/`onWheel`/`onContextMenu`/`onDrag*`/`onCopy` 等;`[key: string]: unknown` 让 `<div clas="x">` 静默通过 |

---

## 🟠 第二梯队 —— 性能 / 健壮性

| #   | 项目                                           | 位置                | 说明                                                                                                                              |
| --- | ---------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **store 代理节点无缓存**                       | `store.ts:157-192`  | 每次属性访问新建 Proxy + 路径数组,`store.a === store.a` 为 false;`.get()` 还分配闭包 + readPath 遍历。修复:代理缓存在 trie 节点上 |
| P2  | **`store.a + 1` → `"51"`**                     | `store.ts:179-181`  | `Symbol.toPrimitive` 恒返回 `String`,number hint 下字符串拼接;按 hint 返回原始值                                                  |
| P3  | **`store.items.map(fn)` 静默 undefined**       | `store.ts:196-200`  | 方法式访问走 apply trap 返回 undefined,`fn` 从不调用;明确 TypeError 更友好                                                        |
| P4  | **`store.<path>.signal.set()` 直写绕过 store** | `store.ts:174-178`  | 写信号不更新 root/后代信号,与 `get()` 分叉;文档化为只读观测或路由到 `setNodeValue`                                                |
| P5  | **`isSignal` instanceof 双包风险**             | signal + dom 各一份 | 双份 signal-polyfill 时误判;改为 duck-typing 检测                                                                                 |
| P6  | **`on()` 单依赖每次两个数组分配**              | `on.ts:31,38`       | 特判非数组分支                                                                                                                    |
| P7  | **`emit` 每次 `[...set]` 快照**                | `emit.ts:44`        | 单监听器也分配数组(有意的快照语义,可接受)                                                                                         |
| P8  | **`Matcher.match` 死代码**                     | `matcher.ts:97-108` | 只有 `matchAll` 被使用;删除或复用                                                                                                 |
| P9  | **`RouterState` 死类型**                       | `types.ts:92-98`    | 未使用;删除                                                                                                                       |
| P10 | **`useNavigate` 命名误导**                     | `utils.ts:41-45`    | 是柯里化函数不是 hook,README 列入 Hooks;改名或真 hook                                                                             |
| P11 | **router 无 SSR 支持**                         | `history.ts:25-32`  | `createPathHistory` 构造即触碰 window;Bun 服务端无法构造。文档化客户端限定或注入 env                                              |

---

## 🟡 第三梯队 —— 工程化 / 文档 / CI

| #   | 项目                     | 位置                      | 说明                                                                                                                                                      |
| --- | ------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **README 快速开始损坏**  | `packages/*/README.md`    | signal/dom 用可调用语法 `count()`(应为 `.get()`);router 缺 `routes` + `<Route>` 无操作                                                                    |
| T2  | **docs 片段不进 CI**     | `ci.yml`                  | `docs/tsconfig.json` 只做本地类型检查,坏片段(如 router-basic 的 Outlet 用法)能上线;接入 CI                                                                |
| T3  | **benchmark 方法论缺陷** | `packages/benchmark/`     | kiko read/write 把 createStore 放进计时循环;immer 对比用 produce 不公平;单次运行无统计/GC 隔离;缺 DOM/For/hydrate/matcher 基准;CI 不跑 bench              |
| T4  | **CI 构建 4 次**         | `ci.yml` + `package.json` | 显式 build + pretypecheck/pretest/presite:build 重复构建;去重                                                                                             |
| T5  | **无覆盖率工具**         | 仓库根                    | `.gitignore` 有 coverage 但无配置/CI 上传                                                                                                                 |
| T6  | **发布流程**             | `publish.yml`             | 无 `npm publish --dry-run`;无 changesets;三包永久 0.0.1;无 CHANGELOG                                                                                      |
| T7  | **包元数据**             | `packages/*/package.json` | 缺 `sideEffects: false`(影响 tree-shaking)、`engines`/`packageManager`;`@types/bun: latest`、`typescript: ^7.0.2` 浮动;根 `"module": "index.ts"` 指向占位 |
| T8  | **示例与脚本**           | 仓库根                    | `react-protal` 包名拼写;`packages/dom` 的 `demo` 脚本指向不存在的 `examples/demo.tsx`;无 router 示例项目;无 store/ErrorBoundary demo                      |
| T9  | **仓库卫生**             | 仓库根                    | 无 CONTRIBUTING.md/CHANGELOG;husky 只有 pre-commit lint-staged;`typecheck` 硬编码 8 个项目(加示例要改脚本)                                                |
| T10 | **测试缺口**             | 各包 test/                | store thenable 的 `Promise.all` 场景、`batch` 内创建 effect、emitter 重入、store `NaN`/`-0` 相等语义、`on(defer)` + 返回清理交互、双包 isSignal           |

---

## ✅ 已完成(三轮修复,已提交)

1. **Router 组合层**(`packages/router`):
   - `<Outlet/>`/`<Navigate/>` 作为 `<Router>` JSX 子元素不再抛错(activeRouter 信号化,effect 延迟解析);
   - `Link.activeClass` 在真实组合下恢复工作 + 分段感知匹配(`/use` 不匹配 `/users`);
   - 初始加载执行守卫(深链重定向,key 检查丢弃迟到结果);
   - Outlet 按 `matched` 深度渲染,嵌套布局逐层可用;
   - matcher 根路由 `/` + children 匹配 bug(`slice(-1)` 吃字符);
   - 新增 JSX 组合形态集成测试(11 个)。

2. **signal 正确性**(`packages/signal`):
   - effect 清理依赖污染(untrack)与清理抛错楔死(返回式清理并入 scope 统一吞错顺序);
   - 调度器逐 effect 重排预算替代全局 MAX_FLUSH_DEPTH(不再误伤无关 effect,off-by-one 修复,经 reportError 上报);
   - `report.ts` 安全上报钩子(调用时查全局、缺失退 console.error、上报失败不中断);
   - `watchValue` 回调抛错后 re-arm(try/catch/finally);
   - store 不再是 thenable(`then`/`catch`/`finally` 返回 undefined,`await store` 不再挂起);
   - resource:source getter 抛错入 error 态、dispose 复位 loading。

3. **dom 绑定可靠性**(`packages/dom`):
   - `watchSignal` 助手 + 全站点 re-arm 修复(渲染抛错后绑定不再永久失效);
   - Show/Suspend/ErrorBoundary 静态分支保留式切换(重挂载后内部绑定存活);
   - 水合三连:keyed For 对齐 flow.ts 条目模型、ErrorBoundary 补 watcher + 依赖经 computed 建立、Suspend 补信号订阅(带 supersede);
   - `hydrateStyle` 补 rebuild(修复水合分支 "[object Object]");
   - IDL 属性 nullish 跳过(不再渲染 "undefined" 字符串)。

验证:全仓 358 测试通过、typecheck 全绿、oxlint 0 错误。
