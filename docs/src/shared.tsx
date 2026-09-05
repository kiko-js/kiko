/**
 * 站点共享组件：导航、页脚与页面骨架。
 * 纯客户端渲染——静态站点不经过 SSR / 水合。
 */
import type { Props } from "@kikojs/dom"

export interface PageLink {
  /** 页面文件名（不含扩展名），如 "guide" */
  page: string
  label: string
}

export const NAV_LINKS: PageLink[] = [
  { page: "index", label: "首页" },
  { page: "guide", label: "指南" },
  { page: "signal", label: "signal" },
  { page: "dom", label: "dom" },
  { page: "router", label: "router" },
  { page: "examples", label: "示例" },
]

export interface LayoutProps extends Props {
  /** 当前页面文件名（不含扩展名），用于导航高亮 */
  page: string
  mainClass?: string
}

export function Layout(props: LayoutProps) {
  return (
    <>
      <header>
        <nav>
          <a class="logo" href="./index.html">
            <span></span>kiko
          </a>
          <ul class="links">
            {NAV_LINKS.map(link => (
              <li>
                <a
                  href={`./${link.page}.html`}
                  aria-current={link.page === props.page ? "page" : undefined}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="https://github.com/FairyScript/kiko" target="_blank" rel="noopener">
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </header>
      <main class={props.mainClass}>{props.children}</main>
      <footer>
        <p>kiko 使用 MIT 许可证 · 通过 GitHub Pages 部署</p>
      </footer>
    </>
  )
}

export interface TocItem {
  id: string
  label: string
  children?: TocItem[]
}

/** 侧边目录（guide / signal / dom / router 等长文档页共用）。 */
export function Toc(props: { items: TocItem[] }) {
  return (
    <aside class="toc">
      <h3>目录</h3>
      <ul>
        {props.items.map(item => (
          <li>
            <a href={`#${item.id}`}>{item.label}</a>
            {item.children && (
              <ul>
                {item.children.map(child => (
                  <li>
                    <a href={`#${child.id}`}>{child.label}</a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
