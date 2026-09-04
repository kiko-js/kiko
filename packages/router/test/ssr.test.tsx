/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Router, Link, Outlet, Navigate } from "../src/components"
import { createRouter } from "../src/router"
import { createMemoryHistory } from "../src/history"
import { useRouter } from "../src/hooks"
import { withSSRRouter } from "../src/server"
import { clearActiveRouter, setActiveRouter } from "../src/context"
import { setSSRRuntime } from "@kikojs/dom"
import { renderToFragment, ssrRuntime } from "../../dom/src/ssr"

// 服务端渲染分支：router 组件通过 @kikojs/dom 的 getSSRRuntime 判断 SSR 模式，
// 因此必须把运行时注册到「dist 实例」（setSSRRuntime 从 @kikojs/dom 导入），
// 与组件读取的 getSSRRuntime 是同一对。afterAll 复位，避免毒化本进程其他测试。
beforeAll(async () => {
  await import("./setup")
  setSSRRuntime(ssrRuntime)
})

afterAll(() => {
  setSSRRuntime(null)
})

const Home = (): Node => <h1>Home</h1>

describe("router SSR", () => {
  it("Router renders its children without touching the DOM", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/", component: Home }],
    })
    const html = await renderToFragment(() => (
      <Router router={router}>
        <section class="s">
          <b>passthrough</b>
        </section>
      </Router>
    ))
    expect(html).toBe('<section class="s"><b>passthrough</b></section>')
  })

  it("Outlet renders the matched route statically (explicit router)", async () => {
    const router = createRouter({
      history: createMemoryHistory("/about"),
      routes: [
        { path: "/", component: Home },
        { path: "/about", component: () => <p>About</p> },
      ],
    })
    const html = await renderToFragment(() => <Outlet router={router} />)
    expect(html).toBe("<p>About</p>")
  })

  it("Outlet renders nothing (no crash) when no router is reachable", async () => {
    const html = await renderToFragment(() => <Outlet />)
    expect(html).toBe("")
  })

  it("nested layouts resolve depth via the SSR frame stack", async () => {
    const Layout = (): Node => (
      <main>
        <Outlet />
      </main>
    )
    const router = createRouter({
      history: createMemoryHistory("/users"),
      routes: [
        {
          path: "/",
          component: Layout,
          children: [{ path: "users", component: () => <p>users list</p> }],
        },
      ],
    })
    const html = await renderToFragment(() => <Outlet router={router} />)
    expect(html).toBe("<main><p>users list</p></main>")
  })

  it("Link renders a static anchor using the preset active router", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [
        { path: "/", component: Home, children: [{ path: "about", component: () => <p>A</p> }] },
      ],
    })
    setActiveRouter(router)
    try {
      const html = await renderToFragment(() => (
        <Link to="/about" class="nav">
          About
        </Link>
      ))
      expect(html).toBe('<a class="nav" href="/about">About</a>')
    } finally {
      clearActiveRouter(router)
    }
  })

  it("Link falls back to the raw `to` when no router is preset", async () => {
    const html = await renderToFragment(() => <Link to="/about">About</Link>)
    expect(html).toBe('<a href="/about">About</a>')
  })

  it("Navigate renders nothing on the server", async () => {
    const html = await renderToFragment(() => <Navigate to="/x" />)
    expect(html).toBe("")
  })

  it("withSSRRouter resolves Link href per request scope (no setActiveRouter)", async () => {
    const router = createRouter({
      base: "/app",
      history: createMemoryHistory("/app/users"),
      routes: [
        { path: "/", component: Home, children: [{ path: "users", component: () => <p>U</p> }] },
      ],
    })
    const html = await withSSRRouter(router, () =>
      renderToFragment(() => <Link to="/users/1">U1</Link>),
    )
    expect(html).toBe('<a href="/app/users/1">U1</a>')
  })

  it("withSSRRouter resolves Outlet and hooks without a preset router", async () => {
    let seenMode = ""
    const Users = (): Node => {
      seenMode = useRouter().mode
      return <p>users</p>
    }
    const router = createRouter({
      history: createMemoryHistory("/users"),
      routes: [
        { path: "/", component: Home },
        { path: "/users", component: Users },
      ],
    })
    const html = await withSSRRouter(router, () => renderToFragment(() => <Outlet />))
    expect(html).toBe("<p>users</p>")
    expect(seenMode).toBe("path")
  })

  it("request scope wins over a stale preset active router", async () => {
    const routerA = createRouter({
      base: "/a",
      history: createMemoryHistory("/a/"),
      routes: [
        { path: "/", component: Home, children: [{ path: "about", component: () => <p>A</p> }] },
      ],
    })
    const routerB = createRouter({
      base: "/b",
      history: createMemoryHistory("/b/"),
      routes: [
        { path: "/", component: Home, children: [{ path: "about", component: () => <p>B</p> }] },
      ],
    })
    // 模拟上一个请求的遗留状态：setActiveRouter 压栈且未清理
    setActiveRouter(routerA)
    try {
      const html = await withSSRRouter(routerB, () =>
        renderToFragment(() => <Link to="/about">About</Link>),
      )
      expect(html).toBe('<a href="/b/about">About</a>')
    } finally {
      clearActiveRouter(routerA)
    }
  })

  it("concurrent renders keep each request's router isolated across awaits", async () => {
    const routerA = createRouter({
      base: "/a",
      history: createMemoryHistory("/a/"),
      routes: [
        { path: "/", component: Home, children: [{ path: "about", component: () => <p>A</p> }] },
      ],
    })
    const routerB = createRouter({
      base: "/b",
      history: createMemoryHistory("/b/"),
      routes: [
        { path: "/", component: Home, children: [{ path: "about", component: () => <p>B</p> }] },
      ],
    })
    // 请求 A 的组件在渲染中途挂起，等请求 B 完整渲染完再恢复——
    // 恢复后仍必须解析到 A 的 router（base /a），不能读到 B 或 null。
    const { promise: gate, resolve: release } = Promise.withResolvers<void>()
    const Nav = async (): Promise<Node> => {
      await gate
      return <Link to="/about">About</Link>
    }
    const renderA = withSSRRouter(routerA, () => renderToFragment(() => <Nav />))
    const renderB = withSSRRouter(routerB, () => renderToFragment(() => <Nav />))
    release()
    const [a, b] = await Promise.all([renderA, renderB])
    expect(a).toBe('<a href="/a/about">About</a>')
    expect(b).toBe('<a href="/b/about">About</a>')
  })
})
