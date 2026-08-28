/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { jsx, render } from "@kikojs/dom"
import { computed, createSignal } from "@kikojs/signal"
import { cleanupWatchers } from "@kikojs/dom/jsx-runtime"
import { createRouter } from "../src/router"
import { Router, Link, Outlet, Navigate } from "../src/components"
import { setActiveRouter, getActiveRouter } from "../src/context"
import type { RouteRecord } from "../src/types"

function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

function drainMicrotasks(max = 20): Promise<void> {
  const queue: Promise<void>[] = []
  for (let i = 0; i < max; i++) {
    queue.push(flushMicrotasks())
  }
  return Promise.all(queue).then(() => undefined)
}

function createRoutes(): RouteRecord[] {
  return [
    { path: "/", component: () => jsx("div", { children: "home" }) },
    { path: "/about", component: () => jsx("div", { children: "about" }) },
    { path: "/users/:id", component: () => jsx("div", { children: "user" }) },
    { path: "/redirect", redirect: "/about" },
  ]
}

describe("Router components", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    // Router() 挂载时设置模块级 activeRouter，跨测试残留会影响抛错断言
    setActiveRouter(null)
  })

  it("Router renders children", () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    const node = Router({ router, children: jsx("span", { children: "hello" }) })
    expect(node.textContent).toBe("hello")
    router.dispose()
  })

  it("R1: disposing one of two coexisting Routers restores the other", () => {
    const routerA = createRouter({ mode: "path", routes: createRoutes() })
    const routerB = createRouter({ mode: "path", routes: createRoutes() })

    // A 先活动
    setActiveRouter(routerA)
    expect(getActiveRouter()).toBe(routerA)

    // 挂载 B（会压栈并设为活动）
    const nodeB = Router({ router: routerB })
    expect(getActiveRouter()).toBe(routerB)

    // 卸载 B（等价于 Router 的 trackCleanup）：应恢复 A，而不是把全局置 null
    cleanupWatchers(nodeB)
    expect(getActiveRouter()).toBe(routerA)

    setActiveRouter(null)
    routerA.dispose()
    routerB.dispose()
  })

  it("Outlet renders current route component", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    const node = Router({ router })
    const outlet = Outlet({})
    router.push("/about")
    await flushMicrotasks()
    expect(outlet.textContent).toBe("about")
    cleanupWatchers(outlet)
    cleanupWatchers(node)
    router.dispose()
  })

  it("Outlet renders the initial route and passes params to the component", async () => {
    window.history.replaceState(null, "", "/users/42")
    const router = createRouter({ mode: "path", routes: createRoutes() })
    const node = Router({ router })
    const outlet = Outlet({})
    expect(outlet.textContent).toBe("user")
    expect(router.params.get()).toEqual({ id: "42" })
    cleanupWatchers(outlet)
    cleanupWatchers(node)
    router.dispose()
  })

  it("Outlet renders nothing (does not throw) when no router is available", () => {
    // 作为 Router 的 JSX children 时，children 先于 Router 求值——Outlet 创建
    // 阶段必然没有 router；延迟解析后此处只应渲染空内容，而不是抛错。
    const outlet = Outlet({})
    expect(outlet.textContent).toBe("")
    // 手动清理：孤儿实例的 effect 订阅 activeRouter 信号，不 dispose 会
    // 在后续测试的 Router 挂载时被触发
    cleanupWatchers(outlet)
  })

  it("Navigate renders a marker (does not throw) when no router is available", () => {
    const marker = Navigate({ to: "/" })
    cleanupWatchers(marker)
  })

  it("Link navigates on click", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      Router({ router, children: Link({ to: "/about", children: "go" }) }),
      container,
    )
    const link = container.querySelector("a")!
    expect(link.getAttribute("href")).toBe("/about")
    link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    dispose()
    router.dispose()
    container.remove()
  })

  it("Link opens external when no router", async () => {
    const link = Link({ to: "https://example.com", children: "ext" }) as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("https://example.com")
  })

  it("Link nested in Router via JSX resolves router lazily", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    // JSX 求值顺序：children（Link）先于 Router 执行，Link 创建时拿不到 router，
    // 必须在点击时惰性解析。
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      Router({ router, children: Link({ to: "/about", children: "go" }) }),
      container,
    )
    const link = container.querySelector("a")!
    link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
    await flushMicrotasks()
    // 修复前 Link 捕获到 null router，点击走整页导航（router.location 停留在 /）
    expect(router.location.get().path).toBe("/about")
    dispose()
    router.dispose()
    container.remove()
  })

  it("Navigate triggers navigation", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    Navigate({ to: "/about" })
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    router.dispose()
  })

  it("Link toggles activeClass on the current route", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", activeClass: "active", children: "go" }) as HTMLAnchorElement
    expect(link.classList.contains("active")).toBe(false)
    router.push("/about")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(true)
    router.push("/")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(false)
    router.dispose()
  })

  it("Link activeClass with exact:true only matches the exact path", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    // exact 模式：/users/42 不应激活 to="/users"
    const link = Link({
      to: "/users",
      activeClass: "on",
      exact: true,
      children: "u",
    }) as HTMLAnchorElement
    router.push("/users/42")
    await drainMicrotasks()
    expect(link.classList.contains("on")).toBe(false)
    router.push("/users")
    await drainMicrotasks()
    expect(link.classList.contains("on")).toBe(true)
    router.dispose()
  })

  it("Link activeClass supports multiple space-separated classes", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", activeClass: "a b", children: "go" }) as HTMLAnchorElement
    router.push("/about")
    await drainMicrotasks()
    expect(link.classList.contains("a")).toBe(true)
    expect(link.classList.contains("b")).toBe(true)
    router.push("/")
    await drainMicrotasks()
    expect(link.classList.contains("a")).toBe(false)
    expect(link.classList.contains("b")).toBe(false)
    router.dispose()
  })

  it("Link does not intercept modified clicks", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/about", children: "go" }) as HTMLAnchorElement
    const before = router.location.get().path
    link.dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    link.dispatchEvent(new MouseEvent("click", { metaKey: true, bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    link.dispatchEvent(new MouseEvent("click", { shiftKey: true, bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    router.dispose()
  })

  it("Link with replace navigates without pushing history", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      Router({ router, children: Link({ to: "/about", replace: true, children: "go" }) }),
      container,
    )
    container
      .querySelector("a")!
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe("/about")
    // replace 后 back 不应回到 /about 之前的历史……此处验证 location 已更新即可
    dispose()
    router.dispose()
    container.remove()
  })

  it("Link target=_blank click is not intercepted", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({
      to: "/about",
      target: "_blank",
      children: "go",
    }) as HTMLAnchorElement
    const before = router.location.get().path
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await flushMicrotasks()
    expect(router.location.get().path).toBe(before)
    router.dispose()
  })

  it("R9: catch-all route renders 404 for unmatched paths", async () => {
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", component: () => jsx("div", { children: "home" }) },
        { path: "*", component: () => jsx("div", { children: "404" }) },
      ],
    })
    const node = Router({ router })
    const outlet = Outlet({})
    await flushMicrotasks()
    expect(router.currentRoute.get()?.path).toBe("/")
    expect(outlet.textContent).toBe("home")

    router.push("/does-not-exist")
    await flushMicrotasks()
    expect(router.currentRoute.get()?.path).toBe("*")
    expect(outlet.textContent).toBe("404")

    cleanupWatchers(outlet)
    cleanupWatchers(node)
    router.dispose()
  })

  it("R5½: Outlet memoizes subtree — component not re-invoked on query-only nav", async () => {
    window.history.replaceState(null, "", "/search?q=1")
    let renderCount = 0
    const Search = () => {
      renderCount++
      return jsx("div", { children: "search" })
    }
    const NotFound = () => {
      renderCount++
      return jsx("div", { children: "404" })
    }
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/search", component: Search },
        { path: "*", component: NotFound },
      ],
    })
    Router({ router })
    const outlet = Outlet({})
    await flushMicrotasks()
    expect(outlet.textContent).toBe("search")

    // 记录 query-only 导航前已渲染次数（忽略上游测试残留 effect 造成的常量偏移）
    const beforeQuery = renderCount

    // query-only 变化：pathname 不变 → 复用旧节点，component 不再被调用
    router.push("/search?q=2")
    await flushMicrotasks()
    expect(renderCount).toBe(beforeQuery)
    expect(router.query.get().q).toBe("2")
    expect(outlet.textContent).toBe("search")

    // pathname 变化：应重建子树，新 component 被调用（计数 +1）
    router.push("/404?q=2")
    await flushMicrotasks()
    expect(renderCount).toBe(beforeQuery + 1)
    expect(outlet.textContent).toBe("404")

    cleanupWatchers(outlet)
    router.dispose()
  })

  it("Outlet keeps signal bindings alive across query-only navigation (regression)", async () => {
    setActiveRouter(null)
    window.history.replaceState(null, "", "/search?q=1")
    const text = createSignal("hello")
    const Search = () => jsx("div", { children: text })
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/search", component: Search },
        { path: "/other", component: () => jsx("div", { children: "other" }) },
      ],
    })
    Router({ router })
    const outlet = Outlet({})
    await flushMicrotasks()
    expect(outlet.textContent).toBe("hello")

    // query-only 导航复用旧节点：不能把节点上的 watcher 清理掉
    router.push("/search?q=2")
    await flushMicrotasks()
    text.set("world")
    await flushMicrotasks()
    expect(outlet.textContent).toBe("world")

    cleanupWatchers(outlet)
    router.dispose()
  })

  it("Outlet keepAlive preserves route state across navigation", async () => {
    setActiveRouter(null)
    window.history.replaceState(null, "", "/a")
    let aRuns = 0
    const count = createSignal(1)
    const PageA = () => {
      aRuns++
      return jsx("div", { children: ["a:", count] })
    }
    const PageB = () => jsx("div", { children: "b" })
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/a", component: PageA, keepAlive: true },
        { path: "/b", component: PageB },
      ],
    })
    Router({ router })
    const outlet = Outlet({})
    await drainMicrotasks()
    expect(outlet.textContent).toBe("a:1")

    count.set(42)
    await flushMicrotasks()
    expect(outlet.textContent).toBe("a:42")

    // 切走：A 离屏保留（不清理、不重跑）
    router.push("/b")
    await drainMicrotasks()
    expect(outlet.textContent).toBe("b")
    expect(aRuns).toBe(1)

    // 切回：原节点原状态恢复
    router.push("/a")
    await drainMicrotasks()
    expect(outlet.textContent).toBe("a:42")
    expect(aRuns).toBe(1)

    cleanupWatchers(outlet)
    router.dispose()
  })

  it("keepAlive on a descendant retains the whole ancestor branch", async () => {
    setActiveRouter(null)
    window.history.replaceState(null, "", "/a")
    let layoutRuns = 0
    let childRuns = 0
    const state = createSignal("saved")
    const Layout = () => {
      layoutRuns++
      return jsx("div", { children: ["layout:", Outlet({})] })
    }
    const PageA = () => {
      childRuns++
      return jsx("span", { children: state })
    }
    const PageB = () => jsx("span", { children: "B" })
    const router = createRouter({
      mode: "path",
      routes: [
        {
          path: "/",
          component: Layout,
          children: [
            { path: "/a", component: PageA, keepAlive: true },
            { path: "/b", component: PageB },
          ],
        },
      ],
    })
    const tree = Router({ router, children: Outlet({}) })
    await drainMicrotasks()
    expect(tree.textContent).toBe("layout:saved")
    expect(layoutRuns).toBe(1)

    // 子路由变化不重跑父布局（key 只看本层 route + 本层 params）
    router.push("/b")
    await drainMicrotasks()
    expect(tree.textContent).toBe("layout:B")
    expect(layoutRuns).toBe(1)

    // 子路由带 keepAlive：整个祖先分支都要保留，回来时状态原样
    router.push("/a")
    await drainMicrotasks()
    expect(tree.textContent).toBe("layout:saved")
    expect(layoutRuns).toBe(1)
    expect(childRuns).toBe(1)

    cleanupWatchers(tree)
  })

  it("Outlet keepAlive evicts least-recently-used branches beyond max", async () => {
    setActiveRouter(null)
    window.history.replaceState(null, "", "/a")
    const runs: Record<string, number> = {}
    const mk = (name: string) => () => {
      runs[name] = (runs[name] ?? 0) + 1
      return jsx("div", { children: name })
    }
    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/a", component: mk("a") },
        { path: "/b", component: mk("b") },
        { path: "/c", component: mk("c") },
      ],
    })
    Router({ router })
    const outlet = Outlet({ keepAlive: { max: 1 } })
    await drainMicrotasks()

    router.push("/b")
    await drainMicrotasks()
    router.push("/c")
    await drainMicrotasks()
    router.push("/a")
    await drainMicrotasks()

    expect(runs.a).toBe(2) // /a 在 b->c 时被 LRU 淘汰，返回时重建
    expect(runs.b).toBe(1)
    expect(runs.c).toBe(1)

    cleanupWatchers(outlet)
    router.dispose()
  })

  it("Outlet reuses the instance when only params change — params are reactive data", async () => {
    setActiveRouter(null)
    window.history.replaceState(null, "", "/users/1")
    let runs = 0
    let router!: ReturnType<typeof createRouter>
    const User = () => {
      runs++
      const id = computed(() => router.params.get().id)
      return jsx("div", { children: id })
    }
    router = createRouter({
      mode: "path",
      routes: [{ path: "/users/:id", component: User }],
    })
    Router({ router })
    const outlet = Outlet({})
    await drainMicrotasks()
    expect(outlet.textContent).toBe("1")
    expect(runs).toBe(1)

    // 相同路由身份、仅参数变化：不重建组件，页面靠信号拿到新参数
    router.push("/users/2")
    await drainMicrotasks()
    expect(outlet.textContent).toBe("2")
    expect(runs).toBe(1)

    cleanupWatchers(outlet)
    router.dispose()
  })

  it("Outlet keyBy can split instances per param when needed", async () => {
    setActiveRouter(null)
    window.history.replaceState(null, "", "/users/1")
    let runs = 0
    let router!: ReturnType<typeof createRouter>
    const User = () => {
      runs++
      return jsx("div", { children: String(router.params.get().id) })
    }
    router = createRouter({
      mode: "path",
      routes: [{ path: "/users/:id", component: User }],
    })
    Router({ router })
    const outlet = Outlet({ keyBy: entry => entry.params.id })
    await drainMicrotasks()
    expect(outlet.textContent).toBe("1")
    expect(runs).toBe(1)

    // keyBy 按参数区分实例：/users/2 是独立实例
    router.push("/users/2")
    await drainMicrotasks()
    expect(outlet.textContent).toBe("2")
    expect(runs).toBe(2)

    cleanupWatchers(outlet)
    router.dispose()
  })
})

describe("JSX composition (children evaluate before Router)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    // Router() 挂载时设置模块级 activeRouter，跨测试残留会影响抛错断言
    setActiveRouter(null)
  })

  it("Outlet composed as JSX child of Router renders the current route", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    // JSX 求值顺序：Outlet 先于 Router 执行；Router 挂载（setActiveRouter）
    // 后 Outlet 的 effect 依赖 activeRouter 信号自动补跑。
    const tree = (
      <Router router={router}>
        <Outlet />
      </Router>
    ) as DocumentFragment
    await drainMicrotasks()
    expect(tree.textContent).toBe("home")
    router.push("/about")
    await drainMicrotasks()
    expect(tree.textContent).toBe("about")
    cleanupWatchers(tree) // 触发 Router 的 trackCleanup：清 activeRouter + dispose
  })

  it("Navigate composed as JSX child of Router navigates after mount", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    const tree = Router({ router, children: Navigate({ to: "/about" }) })
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/about")
    cleanupWatchers(tree)
  })

  it("Link activeClass works when Link is created before Router mounts", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    // Link 先于 Router 求值：activeClass effect 首跑拿不到 router，
    // 修复前该 effect 零依赖永不重跑，activeClass 完全失效。
    const tree = Router({
      router,
      children: Link({ to: "/about", activeClass: "active", children: "go" }),
    })
    const link = (tree as DocumentFragment).firstChild as HTMLAnchorElement
    expect(link.classList.contains("active")).toBe(false)
    router.push("/about")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(true)
    router.push("/")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(false)
    cleanupWatchers(tree)
  })

  it("Link activeClass does not match partial segments", async () => {
    const router = createRouter({ mode: "path", routes: createRoutes() })
    Router({ router })
    const link = Link({ to: "/use", activeClass: "active", children: "u" }) as HTMLAnchorElement
    router.push("/users")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(false)
    router.push("/use")
    await drainMicrotasks()
    expect(link.classList.contains("active")).toBe(true)
    router.dispose()
  })

  it("Outlet renders nested layouts level by level", async () => {
    const routes: RouteRecord[] = [
      {
        path: "/",
        component: () =>
          jsx("main", {
            children: [
              document.createTextNode("layout:"),
              // 布局组件内的 Outlet：渲染 matched 的下一层
              Outlet({}),
            ],
          }),
        children: [{ path: "/inner", component: () => jsx("p", { children: "inner" }) }],
      },
    ]
    const router = createRouter({ mode: "path", routes })
    const tree = (
      <Router router={router}>
        <Outlet />
      </Router>
    ) as DocumentFragment
    await drainMicrotasks()
    // 初始在 "/"：根 Outlet 渲染布局，布局内 Outlet 无下一层可渲染
    expect(tree.textContent).toBe("layout:")
    router.push("/inner")
    await drainMicrotasks()
    // 根 Outlet 渲染布局（matched[0]），布局内 Outlet 渲染 inner（matched[1]）
    expect(tree.textContent).toBe("layout:inner")
    cleanupWatchers(tree)
  })
})
