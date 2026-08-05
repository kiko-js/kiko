/**
 * Scoped-css utilities for the `Style` component: scope-attribute generation,
 * selector rewriting, and constructable-stylesheet management.
 *
 * Pure helpers — no imports from `jsx-runtime` (the DOM glue lives there, in
 * the `Style` component). Scoping follows Vue's `<style scoped>` model adapted
 * for a compiler-free JSX runtime: instead of stamping every element with a
 * scope attribute (which requires a template compiler), the scope attribute
 * lands on the style's NEAREST ANCESTOR ELEMENT and selectors are rewritten to
 * match descendants of that element (`[data-kiko-v1] .card`). Reactive swaps
 * (Show/For) are covered for free — any swapped-in node is a descendant.
 */

let scopeCounter = 0

/** Generate a unique scope attribute name, e.g. `data-kiko-v1`. */
export function createScopeAttr(): string {
  scopeCounter += 1
  return `data-kiko-v${scopeCounter}`
}

interface ConstructableSheetCtor {
  new (): CSSStyleSheet
}

function sheetCtor(): ConstructableSheetCtor | null {
  const view = document.defaultView as unknown as { CSSStyleSheet?: ConstructableSheetCtor } | null
  return view?.CSSStyleSheet ?? null
}

/** True when `new CSSStyleSheet()` + `document.adoptedStyleSheets` work. */
export function supportsConstructable(): boolean {
  const ctor = sheetCtor()
  return (
    ctor !== null &&
    typeof ctor.prototype.replaceSync === "function" &&
    "adoptedStyleSheets" in document
  )
}

/** Create an empty constructable sheet, or null when unsupported. */
export function createSheet(): CSSStyleSheet | null {
  const ctor = sheetCtor()
  return ctor === null ? null : new ctor()
}

export function adoptSheet(sheet: CSSStyleSheet, doc: Document): void {
  const sheets = doc.adoptedStyleSheets as unknown as CSSStyleSheet[]
  sheets.push(sheet)
}

export function unadoptSheet(sheet: CSSStyleSheet, doc: Document): void {
  const sheets = doc.adoptedStyleSheets as unknown as CSSStyleSheet[]
  const i = sheets.indexOf(sheet)
  if (i !== -1) sheets.splice(i, 1)
}

/** At-rule blocks whose inner rules are scoped recursively. */
const RECURSE_AT_RULES = new Set([
  "media",
  "supports",
  "layer",
  "container",
  "document",
  "-moz-document",
])

/**
 * Find the index of the `}` matching the `{` at `open`, skipping strings and
 * comments. Returns -1 when unbalanced.
 */
function findMatchingBrace(text: string, open: number): number {
  let depth = 1
  let i = open + 1
  let inComment = false
  let quote: string | null = null
  while (i < text.length) {
    const c = text.charAt(i)
    const next = text.charAt(i + 1)
    if (inComment) {
      if (c === "*" && next === "/") {
        inComment = false
        i += 2
      } else i += 1
      continue
    }
    if (quote !== null) {
      if (c === "\\") i += 2
      else if (c === quote) quote = null
      else i += 1
      continue
    }
    if (c === "/" && next === "*") {
      inComment = true
      i += 2
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      i += 1
      continue
    }
    if (c === "{") {
      depth += 1
      i += 1
      continue
    }
    if (c === "}") {
      depth -= 1
      if (depth === 0) return i
      i += 1
      continue
    }
    i += 1
  }
  return -1
}

/**
 * Replace `:deep(...)` / `:global(...)` functional pseudos with their inner
 * selector (Vue's piercing selectors — the content stays unscoped).
 */
function stripPierce(selector: string): string {
  let out = ""
  let i = 0
  while (i < selector.length) {
    const deep = selector.indexOf(":deep(", i)
    const global = selector.indexOf(":global(", i)
    let hit = -1
    let openLen = 0
    if (deep !== -1 && (global === -1 || deep < global)) {
      hit = deep
      openLen = 6 // ":deep("
    } else if (global !== -1) {
      hit = global
      openLen = 8 // ":global("
    }
    if (hit === -1) {
      out += selector.slice(i)
      break
    }
    out += selector.slice(i, hit)
    let depth = 1
    let j = hit + openLen
    while (j < selector.length) {
      const c = selector.charAt(j)
      if (c === "(") depth += 1
      else if (c === ")") {
        depth -= 1
        if (depth === 0) break
      }
      j += 1
    }
    if (j >= selector.length) {
      // unbalanced — keep the rest as-is
      out += selector.slice(hit)
      break
    }
    out += selector.slice(hit + openLen, j)
    i = j + 1
  }
  return out
}

/** Rewrite one selector to match the scope root and its descendants. */
function rewriteSelector(sel: string, attr: string): string {
  const s = sel.trim()
  if (s === "") return s
  const pierced = stripPierce(s)
  // A selector that IS a pierce (`:deep(x)` / `:global(x)`) stays unscoped.
  if (s.startsWith(":deep(") || s.startsWith(":global(")) return pierced
  if (pierced.includes("&")) {
    // `&` anchors to the scope root element itself.
    return pierced.replace(/&/g, `[${attr}]`)
  }
  // Descendant match (everything under the root) ∪ root-itself match — the
  // root element must be selectable too, like Vue stamps attrs on it.
  return `[${attr}] ${pierced}, [${attr}]${pierced}`
}

/** Split a selector list on top-level commas (outside parens/brackets/strings). */
function rewriteSelectorList(list: string, attr: string): string {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let inComment = false
  let quote: string | null = null
  for (let k = 0; k < list.length; k++) {
    const c = list.charAt(k)
    const next = list.charAt(k + 1)
    if (inComment) {
      if (c === "*" && next === "/") {
        inComment = false
        k += 1
      }
      continue
    }
    if (quote !== null) {
      if (c === "\\") k += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === "/" && next === "*") {
      inComment = true
      k += 1
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === "(" || c === "[") depth += 1
    else if (c === ")" || c === "]") depth -= 1
    else if (c === "," && depth === 0) {
      parts.push(list.slice(start, k))
      start = k + 1
    }
  }
  parts.push(list.slice(start))
  return parts
    .map(p => rewriteSelector(p, attr))
    .filter(p => p !== "")
    .join(", ")
}

/**
 * Rewrite css for scoped mode: every rule's selectors get scoped to the scope
 * attribute, recursively inside `@media`-style at-rule blocks. `@keyframes`
 * (whose "selectors" are keyframe steps) and block at-rules without selectors
 * (`@font-face`, `@page`, ...) pass through untouched.
 */
export function rewriteScopedCss(css: string, attr: string): string {
  let out = ""
  let i = 0
  const n = css.length

  while (i < n) {
    // top-level comment — copy through
    if (css.charAt(i) === "/" && css.charAt(i + 1) === "*") {
      const end = css.indexOf("*/", i + 2)
      if (end === -1) {
        out += css.slice(i)
        break
      }
      out += css.slice(i, end + 2)
      i = end + 2
      continue
    }

    // scan the prelude: until `{` (block) or `;` (statement) or EOF
    let j = i
    let braceOpen = -1
    let inComment = false
    let quote: string | null = null
    while (j < n) {
      const c = css.charAt(j)
      const next = css.charAt(j + 1)
      if (inComment) {
        if (c === "*" && next === "/") {
          inComment = false
          j += 1
        }
        j += 1
        continue
      }
      if (quote !== null) {
        if (c === "\\") j += 1
        else if (c === quote) quote = null
        j += 1
        continue
      }
      if (c === "/" && next === "*") {
        inComment = true
        j += 1
        j += 1
        continue
      }
      if (c === '"' || c === "'") {
        quote = c
        j += 1
        continue
      }
      if (c === "{") {
        braceOpen = j
        break
      }
      if (c === ";") break
      j += 1
    }

    if (braceOpen === -1) {
      // stray text or a statement at-rule — pass through
      const end = j < n && css.charAt(j) === ";" ? j + 1 : n
      out += css.slice(i, end)
      i = end
      continue
    }

    const prelude = css.slice(i, braceOpen)
    const close = findMatchingBrace(css, braceOpen)
    if (close === -1) {
      out += css.slice(i)
      break
    }

    if (prelude.trimStart().startsWith("@")) {
      const kw = /^@([-\w]+)/.exec(prelude.trimStart())?.[1] ?? ""
      if (RECURSE_AT_RULES.has(kw)) {
        const body = css.slice(braceOpen + 1, close)
        out += prelude + "{\n" + rewriteScopedCss(body, attr) + "\n}"
      } else {
        // @keyframes, @font-face, @page, ... — pass through verbatim
        out += css.slice(i, close + 1)
      }
    } else {
      const body = css.slice(braceOpen + 1, close)
      out += rewriteSelectorList(prelude, attr) + "{" + body + "}"
    }
    i = close + 1
  }

  return out
}
