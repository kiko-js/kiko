/** @jsxImportSource @kikojs/dom */
import "./setup"
import { describe, it, expect, beforeEach } from "bun:test"
import { render } from "@kikojs/dom"
import { createRouter } from "../src/router"
import { Router, Link, Outlet } from "../src/components"
import { setActiveRouter } from "../src/context"
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
    { path: "/", component: () => <div>home</div> },
    { path: "/about", component: () => <div>about</div> },
  ]
}

describe("lazy jsx router probe (experiment)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    setActiveRouter(null)
  })

  // 对照 components.test.tsx:49(同场景,但那里需要 thunk children)
  it("nested Router binds lexically WITHOUT thunk children", async () => {
    const outer = createRouter({ mode: "path", routes: createRoutes() })
    const inner = createRouter({
      mode: "path",
      routes: [{ path: "/", component: () => <p>inner</p> }],
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(
      <Router router={outer}>
        <Link to="/about" activeClass="on">
          go
        </Link>
        {/* 词法 children:惰性求值下应在内层 Router 体内才执行 */}
        <Router router={inner}>
          <Outlet />
        </Router>
      </Router>,
      container,
    )
    await drainMicrotasks()
    expect(container.querySelector("p")?.textContent).toBe("inner")
    outer.push("/about")
    await drainMicrotasks()
    expect(container.querySelector("a")?.classList.contains("on")).toBe(true)
    dispose()
    outer.dispose()
    inner.dispose()
    container.remove()
  })
})
