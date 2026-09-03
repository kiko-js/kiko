/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Router, Link, Outlet, Navigate } from "../src/components"
import { createRouter } from "../src/router"
import { createMemoryHistory } from "../src/history"
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
})
