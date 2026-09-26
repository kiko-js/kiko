/** @jsxImportSource @kikojs/dom */
import { Link } from "@kikojs/router"

/** 兜底路由（path: "*"）：没有任何其他路由匹配时渲染。 */
export function NotFoundPage() {
  return (
    <section>
      <h1>404</h1>
      <p class="muted">没有匹配当前地址的路由。</p>
      <Link to="/">返回首页</Link>
    </section>
  )
}
