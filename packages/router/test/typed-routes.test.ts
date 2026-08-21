import { describe, it, expect } from "bun:test"
import type { RouteComponentProps } from "../src/index"
import {
  defineRoutes,
  type NavPath,
  type PathParams,
  type RoutePaths,
  type RouteRecord,
} from "../src/index"

// Route table with literal paths — the shape `defineRoutes` preserves.
// NOTE: TS checks component arrow params against the RouteRecord constraint
// (permissive RouteParams) — literal param extraction requires an explicit
// record generic (see `typedRecord` below).
const routes = defineRoutes([
  { path: "/", component: () => document.createTextNode("home") },
  { path: "/about", component: () => document.createTextNode("about") },
  {
    path: "/users/:id",
    component: p => document.createTextNode(p.params.id ?? ""),
    children: [
      { path: "profile", component: () => document.createTextNode("profile") },
      { path: "settings/:tab", component: () => document.createTextNode("settings") },
    ],
  },
] as const)

type Paths = RoutePaths<typeof routes>

// Explicit record generic: params are extracted from the path pattern.
const typedRecord: RouteRecord<"/users/:id/settings/:tab"> = {
  path: "/users/:id/settings/:tab",
  component: p => document.createTextNode(`${p.params.id}/${p.params.tab}`),
}

describe("typed route paths", () => {
  it("defineRoutes returns the routes unchanged", () => {
    expect(routes.length).toBe(3)
    expect(routes[1].path).toBe("/about")
  })

  it("RoutePaths flattens nested children with prefixes", () => {
    const valid: Paths = "/users/:id/settings/:tab"
    expect(valid).toBe("/users/:id/settings/:tab")
  })

  it("PathParams extracts param names from a pattern", () => {
    const params: PathParams<"/users/:id/settings/:tab"> = { id: "42", tab: "profile" }
    expect(params.id).toBe("42")
    expect(params.tab).toBe("profile")
  })

  it("NavPath degrades to string without module augmentation", () => {
    const target: NavPath = "/anything/at/all"
    expect(target).toBe("/anything/at/all")
  })
})

// Compile-time guards: each @ts-expect-error proves the type rejects real misuse.

// Unknown param name on a literal path.
const wrongParamGuard: PathParams<"/users/:id"> = { id: "1" }
// @ts-expect-error "idd" is not a param of /users/:id
wrongParamGuard.idd = "2"

// Explicit-generic record rejects unknown params in the component.
const goodComponentGuard: RouteRecord<"/users/:id/settings/:tab">["component"] = p =>
  document.createTextNode(`${p.params.id}/${p.params.tab}`)
function badComponent(p: RouteComponentProps<{ idd: string }>): Node {
  return document.createTextNode(p.params.idd)
}
// @ts-expect-error component params must match the record's path pattern
const badComponentGuard: RouteRecord<"/users/:id/settings/:tab">["component"] = badComponent

// RoutePaths rejects paths that are not in the table.
const knownPathGuard: Paths = "/about"
// @ts-expect-error "/abot" is not a configured route
const typoPathGuard: Paths = "/abot"

export {
  typedRecord,
  goodComponentGuard,
  badComponentGuard,
  wrongParamGuard,
  knownPathGuard,
  typoPathGuard,
}
