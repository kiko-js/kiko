/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Router, Link, Outlet, Navigate } from "../src/components"
import { createRouter } from "../src/router"
import { createMemoryHistory } from "../src/history"
import { setSSRRuntime, hydrate } from "@kikojs/dom"
import { renderToFragment, ssrRuntime } from "../../dom/src/ssr"

// SSR（字符串运行时，src 实例）产出 HTML → 客户端 hydrate（dist 实例，与
// components.tsx 的 trackCleanup/ watching 同一模块实例）采纳。afterAll 复位
// SSR 运行时，避免毒化本进程其他测试。

function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

async function drainMicrotasks(max = 20): Promise<void> {
  for (let i = 0; i < max; i++) {
    await flushMicrotasks()
  }
}

const Home = (): Node => <h1>Home</h1>
const About = (): Node => <h1>About</h1>

beforeAll(async () => {
  await import("./setup")
})

afterAll(() => {
  setSSRRuntime(null)
})

function mount(html: string): HTMLElement {
  const container = document.createElement("div")
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

describe("router hydration", () => {
  it("hydrates Router/Link/Outlet: activeClass applies, clicks navigate in place", async () => {
    const routes = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]
    const serverRouter = createRouter({ history: createMemoryHistory("/about"), routes })
    setSSRRuntime(ssrRuntime)
    const html = await renderToFragment(() => (
      <Router router={serverRouter}>
        <Link to="/" activeClass="on">
          Home
        </Link>
        <Link to="/about" activeClass="on">
          About
        </Link>
        <Outlet router={serverRouter} />
      </Router>
    ))
    setSSRRuntime(null)

    const container = mount(html)
    const clientRouter = createRouter({ history: createMemoryHistory("/about"), routes })
    const stop = hydrate(
      () => (
        <Router router={clientRouter}>
          <Link to="/" activeClass="on" exact>
            Home
          </Link>
          <Link to="/about" activeClass="on">
            About
          </Link>
          <Outlet router={clientRouter} />
        </Router>
      ),
      container,
    )
    await drainMicrotasks()

    // 采纳后补上响应式部分：激活态高亮
    const links = container.querySelectorAll("a")
    expect(links.length).toBe(2)
    expect(links[0]!.classList.contains("on")).toBe(false)
    expect(links[1]!.classList.contains("on")).toBe(true)

    // 点击拦截生效：SPA 导航（不整页跳转），Outlet 原地换内容
    links[0]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
    await drainMicrotasks()
    expect(clientRouter.location.get().path).toBe("/")
    expect(container.querySelector("h1")?.textContent).toBe("Home")

    stop()
  })

  it("hydrates nested layouts and keeps swapping after navigation", async () => {
    const Layout = (): Node => (
      <main>
        <Outlet />
      </main>
    )
    const routes = [
      {
        path: "/",
        component: Layout,
        children: [{ path: "users", component: (): Node => <p>users list</p> }],
      },
    ]
    const serverRouter = createRouter({ history: createMemoryHistory("/users"), routes })
    setSSRRuntime(ssrRuntime)
    const html = await renderToFragment(() => <Outlet router={serverRouter} />)
    setSSRRuntime(null)
    expect(html).toBe("<main><p>users list</p></main>")

    const container = mount(html)
    const clientRouter = createRouter({ history: createMemoryHistory("/users"), routes })
    const stop = hydrate(() => <Outlet router={clientRouter} />, container)
    await drainMicrotasks()
    expect(container.querySelector("main p")?.textContent).toBe("users list")

    clientRouter.push("/")
    await drainMicrotasks()
    // 根路由没有 layout —— Outlet 换出整个已采纳分支
    expect(container.querySelector("main p")).toBeNull()
    stop()
  })

  it("hydrate disposer disposes the router", async () => {
    const routes = [{ path: "/", component: Home }]
    const serverRouter = createRouter({ history: createMemoryHistory("/"), routes })
    setSSRRuntime(ssrRuntime)
    const html = await renderToFragment(() => (
      <Router router={serverRouter}>
        <Outlet router={serverRouter} />
      </Router>
    ))
    setSSRRuntime(null)

    const container = mount(html)
    const clientRouter = createRouter({ history: createMemoryHistory("/"), routes })
    let disposed = false
    const rawDispose = clientRouter.dispose.bind(clientRouter)
    clientRouter.dispose = () => {
      disposed = true
      rawDispose()
    }
    const stop = hydrate(
      () => (
        <Router router={clientRouter}>
          <Outlet router={clientRouter} />
        </Router>
      ),
      container,
    )
    expect(disposed).toBe(false)
    stop()
    // 回归：水合模式的清理挂水合根（子树会被 Outlet 交换移走，挂节点上会丢）
    expect(disposed).toBe(true)
  })

  it("hydrates Navigate: adopts nothing, navigates after Router body runs", async () => {
    const routes = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]
    const serverRouter = createRouter({ history: createMemoryHistory("/"), routes })
    setSSRRuntime(ssrRuntime)
    const html = await renderToFragment(() => (
      <Router router={serverRouter}>
        <Navigate to="/about" />
      </Router>
    ))
    setSSRRuntime(null)
    expect(html).toBe("")

    const container = mount(html)
    const clientRouter = createRouter({ history: createMemoryHistory("/"), routes })
    const stop = hydrate(
      () => (
        <Router router={clientRouter}>
          <Navigate to="/about" />
        </Router>
      ),
      container,
    )
    await drainMicrotasks()
    expect(clientRouter.location.get().path).toBe("/about")
    stop()
  })
})
