/** @jsxImportSource @kikojs/dom */
import { describe, it, expect, beforeAll } from "bun:test"
import { Router, Outlet } from "../src/components"
import { createRouter } from "../src/router"
import { createMemoryHistory } from "../src/history"
import { getActiveRouter } from "../src/context"
import { render } from "@kikojs/dom"

const Home = (): Node => <h1>Home</h1>

beforeAll(async () => {
  await import("./setup")
})

describe("Router unmount cleanup probe", () => {
  it("clears active router on unmount via real render() disposer", async () => {
    const router = createRouter({
      history: createMemoryHistory("/"),
      routes: [{ path: "/", component: Home }],
    })
    const dispose = render(
      <Router router={router}>
        <Outlet router={router} />
      </Router>,
      document.createElement("div"),
    )
    expect(getActiveRouter()).toBe(router)
    dispose()
    // 回归：cleanup 必须挂在随子树移动的 marker 上；挂 fragment 时
    // render() 抽干后 cleanupWatchers 够不到，卸载成为空操作。
    expect(getActiveRouter()).toBeNull()
  })
})
