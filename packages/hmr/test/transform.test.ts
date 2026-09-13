import { describe, it, expect } from "bun:test"
import { parseSync } from "oxc-parser"
import { transformForHmr, type HmrTransformOptions } from "../src/transform"

const RUNTIME = "@kikojs/dom/hmr"
const MOD = "src/app.tsx"

/** Bun 接入的改写选项（bundler 提供 import.meta.hot）。 */
const BUN: HmrTransformOptions = { runtimeModule: RUNTIME, bundler: "bun" }
/** 通用改写：不带 bundler 粘合，交给端点驱动（如 Node 接入）。 */
const GENERIC: HmrTransformOptions = { runtimeModule: RUNTIME }

function transform(source: string, filename = MOD, options: HmrTransformOptions = BUN) {
  return transformForHmr(filename, source, filename, options)
}

/** 输出必须是合法的 TSX：解析失败即回归。 */
function expectParses(code: string, filename = MOD): void {
  const r = parseSync(filename, code)
  expect(r.errors).toEqual([])
}

describe("transformForHmr", () => {
  it("wraps an exported function component", () => {
    const src = `export function App(props: { n: number }) {\n  return <p>{props.n}</p>\n}\n`
    const out = transform(src)
    expect(out).not.toBeNull()
    expect(out?.components).toBe(1)
    const code = out!.code
    expect(code).toContain("function __kiko_o$App(")
    expect(code).toContain(`export const App = __kiko_hmr.ref("src/app.tsx", "App", __kiko_o$App);`)
    expect(code).toContain(`__kiko_hmr.beginModule("src/app.tsx")`)
    expect(code).toContain(`__kiko_hmr.endModule("src/app.tsx")`)
    expect(code).toContain(`import.meta.hot.accept`)
    expect(code).toContain(`import.meta.hot.on("bun:afterUpdate"`)
    expect(code).toContain(
      `import { acceptHmrModule as __kiko_acceptHmrModule } from "@kikojs/hmr/client";`,
    )
    expect(code).toContain(
      `__kiko_acceptHmrModule("src/app.tsx", { url: import.meta.url, managed: typeof import.meta.hot !== "undefined" });`,
    )
    expectParses(code)
  })

  it("omits bundler glue in the generic (endpoint-driven) mode", () => {
    const src = `export function App() {\n  return <p />\n}\n`
    const out = transform(src, MOD, GENERIC)
    const code = out!.code
    expect(out?.components).toBe(1)
    expect(code).not.toContain("import.meta.hot.accept")
    expect(code).not.toContain("bun:afterUpdate")
    expect(code).toContain("__kiko_acceptHmrModule(")
    expectParses(code)
  })

  it("honors a custom client module for the endpoint glue", () => {
    const src = `export function App() {\n  return <p />\n}\n`
    const out = transformForHmr(MOD, src, MOD, { ...BUN, clientModule: "@custom/hmr-client" })
    expect(out!.code).toContain(`from "@custom/hmr-client"`)
    expectParses(out!.code)
  })

  it("wraps a non-exported component used by other components", () => {
    const src = `function Row() {\n  return <li>x</li>\n}\nexport function List() {\n  return <ul><Row /></ul>\n}\n`
    const out = transform(src)
    expect(out?.components).toBe(2)
    expect(out!.code).toContain("const Row = __kiko_hmr.ref(")
    expectParses(out!.code)
  })

  it("wraps a const arrow component and keeps the export", () => {
    const src = `export const Widget = (props) => <b>{props.t}</b>\n`
    const out = transform(src)
    expect(out?.components).toBe(1)
    const code = out!.code
    expect(code).toContain("const __kiko_o$Widget = (props) => <b>{props.t}</b>")
    expect(code).toContain("export const Widget = __kiko_hmr.ref(")
    expectParses(code)
  })

  it("handles a named default-export function and keeps the local name usable", () => {
    const src = `export default function Page() {\n  return <main />\n}\n`
    const out = transform(src)
    const code = out!.code
    expect(code).toContain("function __kiko_o$Page(")
    expect(code).toContain(`__kiko_hmr.ref("src/app.tsx", "default", __kiko_o$Page)`)
    expect(code).toContain("const Page = __kiko_hmr.ref(")
    expect(code).toContain("export default Page;")
    expectParses(code)
  })

  it("handles an anonymous default-export arrow", () => {
    const src = `export default () => <i>anon</i>\n`
    const out = transform(src)
    const code = out!.code
    expect(code).toContain("const __kiko_o$default = () => <i>anon</i>")
    expect(code).toContain("export default __kiko_hmr.ref(")
    expectParses(code)
  })

  it("ignores lowercase helpers and multi-declarator consts", () => {
    const src = `function helper() {\n  return 1\n}\nconst a = 1, b = 2\nexport const thing = () => <x/>\n`
    expect(transform(src)).toBeNull()
  })

  it("wraps PascalCase const but skips lowercase", () => {
    const src = `export const Thing = () => <x/>\nexport const other = () => <y/>\n`
    const out = transform(src)
    expect(out?.components).toBe(1)
    const code = out!.code
    expect(code).toContain("const Thing = __kiko_hmr.ref(")
    expect(code).toContain("const other = () => <y/>")
    expectParses(code)
  })

  it("injects only signal-scope glue (no accept) for a component-free module", () => {
    const src = `import { createSignal } from "@kikojs/dom"\nexport const count = createSignal(0)\n`
    const out = transform(src)
    expect(out).not.toBeNull()
    const code = out!.code
    expect(code).toContain("beginModule")
    expect(code).toContain("endModule")
    // 非组件模块不成为 accept 边界（否则更新停止冒泡），但仍登记到端点。
    expect(code).not.toContain("import.meta.hot.accept")
    expect(code).toContain("__kiko_acceptHmrModule(")
    expect(out?.components).toBe(0)
    expectParses(code)
  })

  it("returns null for a plain module", () => {
    const src = `export const add = (a: number, b: number) => a + b\n`
    expect(transform(src)).toBeNull()
  })

  it("returns null on a syntax error instead of throwing", () => {
    expect(transform("export const = broken")).toBeNull()
  })

  it("escapes moduleId and keeps other exports intact", () => {
    const src = `export const count = createSignal(0)\nexport function App() {\n  return <p>{count}</p>\n}\n`
    const out = transform(src, 'weird"path.tsx')
    const code = out!.code
    expect(code).toContain('"weird\\"path.tsx"')
    expect(code).toContain("export const count = createSignal(0)")
    expectParses(code, 'weird"path.tsx')
  })
})
