# @kikojs/router

基于 `@kikojs/dom` 的声明式路由。支持 path / hash 两种模式、嵌套路由、路由守卫、`Link` / `Outlet` 导航原语与路由 hooks。

## 安装

```bash
bun add @kikojs/router
# 或
npm install @kikojs/router
```

## 快速开始

路由表通过 `createRouter({ routes })` 的 `routes` 配置声明，`<Outlet />` 负责渲染当前匹配到的路由组件。

```tsx
import { createRouter, Router, Link, Outlet } from "@kikojs/router"
import { render } from "@kikojs/dom"

function Home() {
  return <h1>Home</h1>
}

function About() {
  return <h1>About</h1>
}

const router = createRouter({
  mode: "path",
  routes: [
    { path: "/", component: Home },
    { path: "/about", component: About },
  ],
})

render(
  <Router router={router}>
    <nav>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
    </nav>
    <Outlet />
  </Router>,
  document.getElementById("app")!,
)
```

### catch-all / 404

顶层 `path: "*"` 的路由会作为 404 兜底，仅当没有任何其他路由匹配完整路径时生效：

```tsx
const router = createRouter({
  mode: "path",
  routes: [
    { path: "/", component: Home },
    { path: "*", component: () => <h1>404 Not Found</h1> },
  ],
})
```

### 类型化导航目标（可选）

默认所有跳转目标是 `string`。用 `defineRoutes` 声明路由表并做一次模块增强后，`navigate` / `push` / `replace` / `<Link to>` / `<Navigate to>` / 守卫返回值都会被约束为已配置路径的联合——拼写错误编译期报错，IDE 自动补全：

```ts
// routes.ts
import { defineRoutes, type RoutePaths } from "@kikojs/router"

export const routes = defineRoutes([
  { path: "/", component: Home },
  { path: "/users/:id", component: User, children: [{ path: "profile", component: Profile }] },
])

declare module "@kikojs/router" {
  interface RouterPaths {
    paths: RoutePaths<typeof routes> // "/" | "/users/:id" | "/users/:id/profile"
  }
}
```

路由记录的 `path` 传显式字面量泛型时，组件 props 的 `params` 按模式精确类型化：`RouteRecord<"/users/:id">` 的组件里 `params.id` 为 `string` 且拼错报错。`meta` 同样可通过扩展 `RouteMeta` 接口获得项目级类型。

### 可注入的响应式 history

history 是独立的响应式事实源（`location` 为信号），三种实现接口完全一致：

- `createPathHistory(base?)`——浏览器 History API；
- `createHashHistory()`——URL hash；
- `createMemoryHistory(initial?)`——纯内存条目栈，无 DOM 依赖，适用于测试、SSR 与非浏览器环境。

默认按 `mode` 自建并拥有其生命周期；也可以注入共享：

```ts
import { createRouter, createMemoryHistory } from "@kikojs/router"

const history = createMemoryHistory("/")
const router = createRouter({ history, routes }) // mode 取自 history.kind
```

同一 history 实例可被多个 router 共享：每个 router 独立观察位置变化并用自己的路由表与守卫处理。注入时 router 不拥有 history——`dispose()` 只解绑自身。

### 滚动管理（scrollBehavior）

配置 `scrollBehavior` 后，router 接管 `history.scrollRestoration`（dispose 时恢复），每次导航完成后调用钩子决定滚动目标：

```ts
const router = createRouter({
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition // 浏览器前进/后退：回到离开时的位置
    if (to.hash) return { el: to.hash, behavior: "smooth" }
    return { top: 0 } // 常规导航回顶
    // 返回 false / undefined 跳过；返回 Promise 可等布局稳定后再滚
  },
})
```

- 滚动位置按历史条目存储（包装在 history.state 内，对 `location.state` 透明）；
- 支持坐标（`top` / `left`）、元素（`el`：选择器或引用）与平滑滚动（`behavior`）；
- 过期的异步结果会被丢弃（快速连续导航不会互相覆盖滚动）。

## SSR（服务端渲染）

`@kikojs/router` 的组件可以在 kiko 的 SSR 字符串模式下安全渲染，不会因为触碰
`document` / `window` 而抛错：

- **`Router`**：透传给其 children（内容已在 JSX 求值期序列化）；不触碰 active 栈。
- **`Outlet`**：静态渲染当前深度匹配的路由组件，嵌套布局按 SSR 帧栈解析深度；
  拿不到 router 时输出空（与客户端“无 router 渲染空”语义一致）。
- **`Link`**：输出静态 `<a href>`（模式 / base 按请求作用域内的 active router 解析）。
- **`Navigate`**：导航是客户端副作用，SSR 输出为空。

服务端必须用 **`createMemoryHistory`**（path / hash 两种 history 都会读取
`window`），并以请求路径为初始路径。解析顺序：`Outlet` 的显式 `router` prop →
父级 Outlet 帧 → 请求作用域（`withSSRRouter`）→ `setActiveRouter` 预置（仅客户端 /
测试）。

服务端完整流程：**渲染前 `await router.ready`**（初始守卫/重定向落定，否则重定向页
会按重定向前的内容输出），再用 **`withSSRRouter`**（`@kikojs/router/server`，
AsyncLocalStorage 实现）按请求绑定 router，同一进程并发渲染互不串扰：

```tsx
import { createRouter, Outlet } from "@kikojs/router"
import { withSSRRouter } from "@kikojs/router/server"
import { renderToFragment } from "@kikojs/dom/server"

const router = createRouter({
  history: createMemoryHistory(requestUrlPath), // 例如 "/users"
  routes: [{ path: "/", component: Layout, children: [{ path: "users", component: Users }] }],
})

const html = await withSSRRouter(router, () => renderToFragment(() => <Outlet />))
```

### 水合（hydrate）

路由树支持客户端水合——直接对 SSR 产物采纳现有 DOM，不重建：

```tsx
import { createRouter } from "@kikojs/router"
import { hydrate } from "@kikojs/dom"

// 客户端按真实 URL 重建 router；路由表需与服务端一致
const clientRouter = createRouter({ routes, mode: "path" })
const stop = hydrate(
  () => (
    <Router router={clientRouter}>
      <Link to="/" activeClass="on">
        Home
      </Link>
      <Outlet />
    </Router>
  ),
  document.getElementById("app")!,
)
```

- `Link` 采纳后补上点击拦截与 `activeClass` 高亮；`Outlet` 采纳当前路由内容并
  插入内部锚点，后续导航原地交换。
- `<Navigate>` 水合输出为空，导航由客户端 effect 触发（服务端重定向请用守卫 +
  `router.ready` + HTTP 3xx）。

也可以在 `<Outlet router={router} />` 显式传 prop（嵌套布局由此自动向子级传递）；
但 `Link` 与 hooks 无法传 prop，建议统一走 `withSSRRouter`。

> ⚠️ 客户端的 `setActiveRouter` 是模块级全局信号，不要在服务端按请求调用——
> 并发请求会互相覆盖且压栈不清理。它只用于客户端 Router 挂载与测试。

## API

- **创建**：`createRouter(options)`（`mode: "path" | "hash"`）、`getRouteProps`
- **组件**：`Router`、`Link`、`Outlet`、`Navigate`
- **Hooks**：`useRouter`、`useRoute`、`useParams`、`useQuery`、`useLocation`、`useIsActive`、`useMatch`、`useNavigate`
- **导航**：`useNavigate`、`redirect`、`redirectReplace`、`buildPath`
- **守卫**：`createAuthGuard`、`combineGuards`
- **历史**：`createPathHistory`、`createHashHistory`、`createMemoryHistory`
- **SSR**：`withSSRRouter`（`@kikojs/router/server`）

## 文档

- 官网：<https://kiko-js.github.io/kiko/>
- 源码：<https://github.com/kiko-js/kiko>
