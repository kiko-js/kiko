/** @jsxImportSource @kikojs/dom */
import { Link, Outlet } from "@kikojs/router"

/**
 * 应用外壳：导航 + Outlet。`<style>` 默认 scoped——选择器被限定到最近的
 * 祖先元素（这里是 .app 所在的 div），Show / For 动态插入的节点自动覆盖。
 */
export function App() {
  return (
    <div class="app">
      <style>{`
        .app { max-width: 640px; margin: 0 auto; padding: 24px 16px 64px; line-height: 1.6; }
        nav { display: flex; gap: 16px; border-bottom: 1px solid #ddd; padding-bottom: 12px; }
        nav a { color: #444; text-decoration: none; }
        nav a.active { color: #e11d48; font-weight: 600; }
        h1 { font-size: 1.5rem; }
        .counter { display: flex; align-items: center; gap: 12px; }
        .counter span { min-width: 2ch; text-align: center; font-weight: 700; }
        .row { display: flex; gap: 8px; margin: 12px 0; }
        .tasks { list-style: none; padding: 0; }
        .tasks li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
        .tasks li.done span { text-decoration: line-through; color: #999; }
        .muted { color: #777; }
      `}</style>
      <nav>
        <Link to="/" exact activeClass="active">
          首页
        </Link>
        <Link to="/tasks" activeClass="active">
          任务
        </Link>
        <Link to="/users/1" activeClass="active">
          用户
        </Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
