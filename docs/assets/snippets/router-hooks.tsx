/** @jsxImportSource @kikojs/dom */
import { computed } from "@kikojs/signal"
import { useParams, useQuery, useLocation } from "@kikojs/router"

// 同一路由身份下组件函数只执行一次：query/hash/params 变化不会重跑组件。
// 需要响应式消费时把 hook 放进 computed / effect / signal 绑定。
function UserPage() {
  const id = computed(() => useParams().id) // /users/1 -> /users/2 自动更新
  const tab = computed(() => useQuery().tab) // ?tab=posts -> ?tab=replies 自动更新
  const path = computed(() => useLocation().path)

  return (
    <div>
      <h1>用户 {id}</h1>
      <p>tab: {tab}</p>
      <p>当前路径: {path}</p>
    </div>
  )
}
