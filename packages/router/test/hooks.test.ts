import "./setup"
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { createRouter } from "../src/router"
import { Router, Outlet } from "../src/components"
import {
  setActiveRouter,
  tryUseRouter,
  useLocation,
  useParams,
  useQuery,
  useRoute,
  useRouter,
  type ReactiveSnapshot,
} from "../src/hooks"
import { useNavigate } from "../src/utils"
import { cleanupWatchers } from "@kikojs/dom/jsx-runtime"
import type { RouteLocation, RouteParams, RouteQuery, RouteRecord } from "../src/types"

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

const routes: RouteRecord[] = [
  { path: "/", component: () => document.createTextNode("home") },
  { path: "/about", component: () => document.createTextNode("about") },
  { path: "/users/:id", component: () => document.createTextNode("user") },
  { path: "/search", component: () => document.createTextNode("search") },
]

describe("router hooks", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    setActiveRouter(null)
  })

  afterEach(() => {
    setActiveRouter(null)
  })

  it("useRouter throws outside Router and returns the active router inside", () => {
    setActiveRouter(null)
    expect(() => useRouter()).toThrow(/inside a Router/)

    const router = createRouter({ mode: "path", routes })
    setActiveRouter(router)
    expect(useRouter()).toBe(router)
    expect(tryUseRouter()).toBe(router)

    setActiveRouter(null)
    expect(tryUseRouter()).toBeNull()
    router.dispose()
  })

  it("tryUseRouter returns null when no router is active", () => {
    setActiveRouter(null)
    expect(tryUseRouter()).toBeNull()
  })

  it("useParams/useQuery/useLocation expose live reactive snapshots", async () => {
    window.history.replaceState(null, "", "/users/42?tab=a&tag=x&tag=y#frag")
    const router = createRouter({ mode: "path", routes })
    setActiveRouter(router)

    const params = useParams()
    const query = useQuery()
    const location = useLocation()

    expect(params.get()).toEqual({ id: "42" })
    expect(params.id).toBe("42")
    expect(params()).toEqual({ id: "42" })

    expect(query.get()).toEqual({ tab: "a", tag: ["x", "y"] })
    expect(query.tab).toBe("a")
    expect(query.tag).toEqual(["x", "y"])

    expect(location.get().path).toBe("/users/42")
    expect(location.path).toBe("/users/42")
    expect(location.hash).toBe("frag")
    expect(location.fullPath).toBe("/users/42?tab=a&tag=x&tag=y#frag")

    router.push("/search?q=hi")
    await drainMicrotasks()

    expect(params.get()).toEqual({})
    expect(query.get()).toEqual({ q: "hi" })
    expect(location.get().path).toBe("/search")

    setActiveRouter(null)
    router.dispose()
  })

  it("useRoute returns a live aggregate snapshot", async () => {
    window.history.replaceState(null, "", "/users/7")
    const router = createRouter({ mode: "path", routes })
    setActiveRouter(router)

    const route = useRoute()
    expect(route.route?.path).toBe("/users/:id")
    expect(route.matched.map((m: { route: RouteRecord }) => m.route.path)).toEqual(["/users/:id"])
    expect(route.params).toEqual({ id: "7" })
    expect(route.location.path).toBe("/users/7")

    router.push("/about")
    await drainMicrotasks()

    expect(route.route?.path).toBe("/about")
    expect(route.params).toEqual({})
    expect(route.location.path).toBe("/about")

    setActiveRouter(null)
    router.dispose()
  })

  it("useNavigate returns a navigate function bound to the router", async () => {
    const router = createRouter({ mode: "path", routes })
    setActiveRouter(router)

    const navigate = useNavigate(router)
    await navigate("/about")
    expect(router.location.get().path).toBe("/about")

    await navigate("/search", { replace: true, state: { from: "test" } })
    expect(router.location.get().path).toBe("/search")
    expect(router.location.get().state).toEqual({ from: "test" })

    setActiveRouter(null)
    router.dispose()
  })

  it("hooks work inside a route rendered by Router/Outlet", async () => {
    type Captured = {
      params: ReactiveSnapshot<RouteParams>
      query: ReactiveSnapshot<RouteQuery>
      location: ReactiveSnapshot<RouteLocation>
      route: ReturnType<typeof useRoute>
      navigate: ReturnType<typeof useNavigate>
    }
    let captured: Captured | null = null

    const Page = (): Node => {
      const router = useRouter()
      captured = {
        params: useParams(),
        query: useQuery(),
        location: useLocation(),
        route: useRoute(),
        navigate: useNavigate(router),
      }
      return document.createTextNode("page")
    }

    const router = createRouter({
      mode: "path",
      routes: [
        { path: "/", component: Page },
        { path: "/users/:id", component: Page },
      ],
    })
    const tree = Router({ router, children: Outlet({}) })
    await drainMicrotasks()

    expect(tree.textContent).toBe("page")
    expect(captured!.params.get()).toEqual({})

    router.push("/users/9?x=1")
    await drainMicrotasks()
    expect(captured!.params.get()).toEqual({ id: "9" })
    expect(captured!.query.get()).toEqual({ x: "1" })

    await captured!.navigate("/")
    await drainMicrotasks()
    expect(router.location.get().path).toBe("/")

    cleanupWatchers(tree)
  })
})
