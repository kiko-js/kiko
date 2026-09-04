/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { Router, Outlet } from "../src/components"
import { createRouter } from "../src/router"
import { createMemoryHistory } from "../src/history"
import { render } from "@kikojs/dom"

const Home = (): Node => <h1>Home</h1>

beforeAll(async () => {
  await import("./setup")
})

describe("Router unmount cleanup probe", () => {
  it("disposes the router on unmount via real render() disposer", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/", component: Home }],
    })
    let disposed = false
    const rawDispose = router.dispose.bind(router)
    router.dispose = () => {
      disposed = true
      rawDispose()
    }
    const dispose = render(
      <Router router={router}>
        <Outlet router={router} />
      </Router>,
      document.createElement("div"),
    )
    expect(disposed).toBe(false)
    dispose()
    // 回归：cleanup 必须挂在随子树移动的 marker 上；挂 fragment 时
    // render() 抽干后 cleanupWatchers 够不到，卸载成为空操作。
    expect(disposed).toBe(true)
  })
})
