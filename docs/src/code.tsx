/**
 * 代码展示组件：字面量代码（Code）与按 snippet 路径懒加载的代码块（CodeBlock）。
 * 高亮依赖 shell 里的 highlight.js CDN 全局（window.hljs）。
 */
import type { Props } from "@kikojs/dom"

declare global {
  interface Window {
    hljs?: { highlightElement(el: Element): void }
  }
}

function highlight(el: Element) {
  window.hljs?.highlightElement(el)
}

export interface CodeProps extends Props {
  /** 代码文本 */
  code: string
  /** highlight.js 语言类名，如 "tsx" / "ts" / "shell" */
  lang: string
}

export function Code(props: CodeProps) {
  return (
    <div class="code-block">
      <pre>
        <code
          class={`language-${props.lang}`}
          ref={(el: HTMLElement) => {
            el.textContent = props.code
            highlight(el)
          }}
        />
      </pre>
    </div>
  )
}

export interface CodeBlockProps extends Props {
  /** snippet 路径，如 "./assets/snippets/counter.tsx" */
  src: string
  /** highlight.js 语言类名，默认 typescript */
  lang?: string
}

export function CodeBlock(props: CodeBlockProps) {
  return (
    <div class="code-block">
      <pre>
        <code
          class={`language-${props.lang ?? "typescript"}`}
          ref={(el: HTMLElement) => {
            // 挂载后再拉取：静态站点无 SSR，snippet 在浏览器端注入
            void fetch(props.src)
              .then(res => res.text())
              .then(text => {
                el.textContent = text
                highlight(el)
              })
              .catch(() => {
                el.textContent = `// 加载失败：${props.src}`
              })
          }}
        />
      </pre>
    </div>
  )
}
