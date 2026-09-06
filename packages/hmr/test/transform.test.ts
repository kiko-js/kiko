import { describe, it, expect } from "bun:test"
import { parseSync } from "oxc-parser"
import { transformForHmr } from "../src/bun/transform"

const RUNTIME = "@kikojs/dom/hmr"
const MOD = "src/app.tsx"

function transform(source: string, filename = MOD) {
  return transformForHmr(filename, source, filename, RUNTIME)
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
    expectParses(code)
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
    expect(code).not.toContain("import.meta.hot")
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
