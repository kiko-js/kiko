import { parseSync } from "oxc-parser"
import type { BindingIdentifier, Function, Program, VariableDeclaration } from "oxc-parser"

/**
 * HMR 组件模块改写。基于 oxc-parser 的 AST span 做文本拼接（不重排格式）：
 *
 * 1. 顶层 PascalCase 组件声明（函数声明 / const 箭头与函数表达式 / 默认导出）
 *    原名改写为 `__kiko_o$<name>`，并在声明之后插入
 *    `const <name> = __kiko_hmr.ref(moduleId, name, __kiko_o$<name>)`；
 *    后续引用在调用期解析到稳定包装，模块重求值后旧包装通过注册表拿到新实现。
 * 2. 注入 `beginModule` / `endModule`（模块级信号身份作用域）与
 *    `import.meta.hot` 粘合代码（自身变更走 accept 回调；依赖变更冒泡走
 *    `bun:afterUpdate` 事件）。
 * 3. 无组件的模块只在源码包含 `createSignal` 时注入模块作用域胶水，
 *    不注入 accept——非组件模块不应成为热更新边界，否则更新停止冒泡。
 */

export interface HmrTransformResult {
  code: string
  /** 注册的组件数量（含默认导出）。 */
  components: number
}

interface Edit {
  start: number
  end: number
  text: string
}

interface Registration {
  /** 注册表里的组件名；默认导出为 "default"。 */
  name: string
  /** 改写后的原实现绑定名。 */
  local: string
  /** 注册行的对外绑定名；匿名默认导出为 null（直接 export default ref(...)）。 */
  binding: string | null
  exported: boolean
  /** 声明结束位置（注册行插入点）。 */
  end: number
}

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/
const INTERNAL_PREFIX = "__kiko"

function isComponentName(name: string): boolean {
  return PASCAL_CASE.test(name) && !name.startsWith(INTERNAL_PREFIX)
}

function isComponentInit(init: unknown): boolean {
  const t = (init as { type?: string } | null | undefined)?.type
  return t === "ArrowFunctionExpression" || t === "FunctionExpression"
}

export function transformForHmr(
  filename: string,
  source: string,
  moduleId: string,
  runtimeModule: string,
): HmrTransformResult | null {
  let program: Program
  try {
    const parsed = parseSync(filename, source)
    if (parsed.errors.length > 0) return null
    program = parsed.program
  } catch {
    return null
  }

  const edits: Edit[] = []
  const registrations: Registration[] = []

  /** 命名组件：重命名原实现 + 撤除原 export 前缀（export 移到注册行）。 */
  const pushNamed = (
    name: string,
    id: BindingIdentifier,
    declStart: number,
    end: number,
    exported: boolean,
    exportStart: number | null,
  ): void => {
    const local = `${INTERNAL_PREFIX}_o$${name}`
    edits.push({ start: id.start, end: id.end, text: local })
    if (exportStart !== null) {
      edits.push({ start: exportStart, end: declStart, text: "" })
    }
    registrations.push({ name, local, binding: name, exported, end })
  }

  const collectVariable = (
    decl: VariableDeclaration,
    end: number,
    exported: boolean,
    exportStart: number | null,
  ): void => {
    if (decl.declarations.length !== 1) return
    const declarator = decl.declarations[0]
    if (!declarator) return
    const id = declarator.id
    if (id.type !== "Identifier") return
    if (!isComponentName(id.name) || !isComponentInit(declarator.init)) return
    pushNamed(id.name, id, decl.start, end, exported, exportStart)
  }

  for (const st of program.body) {
    if (st.type === "FunctionDeclaration") {
      if (st.id && isComponentName(st.id.name)) {
        pushNamed(st.id.name, st.id, st.start, st.end, false, null)
      }
      continue
    }
    if (st.type === "ExportNamedDeclaration" && st.declaration) {
      const d = st.declaration
      if (d.type === "FunctionDeclaration") {
        if (d.id && isComponentName(d.id.name)) {
          pushNamed(d.id.name, d.id, d.start, st.end, true, st.start)
        }
      } else if (d.type === "VariableDeclaration") {
        collectVariable(d, st.end, true, st.start)
      }
      continue
    }
    if (st.type === "ExportDefaultDeclaration") {
      const d = st.declaration
      if (d.type === "FunctionDeclaration" || d.type === "FunctionExpression") {
        const fn = d as Function
        if (fn.id && isComponentName(fn.id.name)) {
          // export default function App() {} — 保留本地名 + default 注册
          const local = `${INTERNAL_PREFIX}_o$${fn.id.name}`
          edits.push({ start: fn.id.start, end: fn.id.end, text: local })
          edits.push({ start: st.start, end: d.start, text: "" })
          registrations.push({
            name: "default",
            local,
            binding: fn.id.name,
            exported: false,
            end: st.end,
          })
        }
      } else if (d.type === "ArrowFunctionExpression") {
        // export default <expr> → const __kiko_o$default = <expr>
        const local = `${INTERNAL_PREFIX}_o$default`
        edits.push({ start: st.start, end: d.start, text: `const ${local} = ` })
        registrations.push({ name: "default", local, binding: null, exported: false, end: st.end })
      }
      continue
    }
    if (st.type === "VariableDeclaration") {
      collectVariable(st, st.end, false, null)
    }
  }

  const quote = (s: string): string => JSON.stringify(s)
  const header: string[] = []
  const footer: string[] = []
  const needsScope = registrations.length > 0 || source.includes("createSignal")

  if (needsScope) {
    header.push(
      `import { installHmr as __kiko_installHmr } from ${quote(runtimeModule)};`,
      `const __kiko_hmr = __kiko_installHmr();`,
      `__kiko_hmr.beginModule(${quote(moduleId)});`,
      ``,
    )
    footer.push(`__kiko_hmr.endModule(${quote(moduleId)});`)
  }
  if (registrations.length > 0) {
    for (const r of registrations) {
      const ref = `__kiko_hmr.ref(${quote(moduleId)}, ${quote(r.name)}, ${r.local})`
      // 注册行插在声明之后（而非文件尾）：同模块更靠后的顶层使用（如
      // render(<App />)）在求值时必须能解析到包装绑定，否则 TDZ 崩溃。
      if (r.binding === null) {
        edits.push({ start: r.end, end: r.end, text: `\nexport default ${ref};\n` })
      } else {
        const line = `${r.exported ? "export " : ""}const ${r.binding} = ${ref};`
        edits.push({ start: r.end, end: r.end, text: `\n${line}` })
        if (r.name === "default")
          edits.push({ start: r.end, end: r.end, text: `\nexport default ${r.binding};` })
      }
    }
    footer.push(
      `if (import.meta.hot) {`,
      `  import.meta.hot.accept((m) => { __kiko_hmr.moduleUpdated(${quote(moduleId)}, m) })`,
      `  import.meta.hot.on("bun:afterUpdate", () => { __kiko_hmr.moduleUpdated(${quote(moduleId)}, null) })`,
      `}`,
    )
  }
  if (registrations.length === 0 && header.length === 0) return null

  // 从后往前应用，避免位置漂移
  edits.sort((a, b) => b.start - a.start)
  let code = source
  for (const e of edits) {
    code = code.slice(0, e.start) + e.text + code.slice(e.end)
  }
  return {
    code: header.join("\n") + "\n" + code + "\n" + footer.join("\n") + "\n",
    components: registrations.length,
  }
}
