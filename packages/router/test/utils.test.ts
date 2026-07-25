import { describe, it, expect } from "bun:test"
import { buildPath, getQueryValue, pathsEqual, redirect, redirectReplace } from "../src/utils"

describe("router utilities", () => {
  it("redirect creates a redirect descriptor", () => {
    const r = redirect("/home", { foo: "bar" })
    expect(r).toEqual({ path: "/home", state: { foo: "bar" } })
  })

  it("redirectReplace creates a replace redirect descriptor", () => {
    const r = redirectReplace("/home")
    expect(r).toEqual({ path: "/home", replace: true })
  })

  it("buildPath appends query string", () => {
    const path = buildPath("/search", { q: "hello", tag: ["a", "b"] })
    expect(path).toBe("/search?q=hello&tag=a&tag=b")
  })

  it("buildPath returns path unchanged when query is empty", () => {
    expect(buildPath("/home", {})).toBe("/home")
    expect(buildPath("/home")).toBe("/home")
  })

  it("getQueryValue returns single value or first array item", () => {
    expect(getQueryValue({ q: "hello" }, "q")).toBe("hello")
    expect(getQueryValue({ q: ["a", "b"] }, "q")).toBe("a")
    expect(getQueryValue({}, "q")).toBeUndefined()
  })

  it("pathsEqual ignores query string and trailing slash", () => {
    expect(pathsEqual("/home", "/home")).toBe(true)
    expect(pathsEqual("/home/", "/home")).toBe(true)
    expect(pathsEqual("/home?q=1", "/home")).toBe(true)
    expect(pathsEqual("/home", "/about")).toBe(false)
  })
})
