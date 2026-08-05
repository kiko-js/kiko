/** @jsxImportSource @kikojs/dom */
import { useParams, useQuery, useLocation } from "@kikojs/router"

// 在路由组件内部使用。Outlet 每次导航都会重新执行组件函数，
// 因此这里拿到的是当前导航的最新快照。
function UserPage() {
  const params = useParams() // { id: "42" }
  const query = useQuery() // { tab: "posts" }
  const location = useLocation() // { path: "/users/42", query, fullPath, ... }

  return (
    <div>
      <h1>用户 {params.id}</h1>
      <p>tab: {String(query.tab)}</p>
      <p>当前路径: {location.path}</p>
    </div>
  )
}
