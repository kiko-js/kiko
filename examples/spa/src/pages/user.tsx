/** @jsxImportSource @kikojs/dom */
import { computed } from "@kikojs/signal"
import { useNavigate, useParams, useQuery } from "@kikojs/router"

/**
 * 动态参数页：/users/:id?tab=posts
 * hook 返回响应式快照，放进 computed 后，URL 变化只更新绑定的节点，
 * 组件函数本身不会重跑。
 */
export function UserPage() {
  const id = computed(() => useParams().id ?? "未知")
  const tab = computed(() => useQuery().tab ?? "profile")
  const navigate = useNavigate()

  return (
    <section>
      <h1>用户 {id}</h1>
      <p class="muted">当前标签：{tab}</p>
      <div class="row">
        <button onClick={() => void navigate(`/users/${id.get()}?tab=profile`)}>资料</button>
        <button onClick={() => void navigate(`/users/${id.get()}?tab=posts`)}>文章</button>
      </div>
      <p class="muted">
        从 /users/1 切到 /users/2 不会重建组件——params 和 query 都是信号，由绑定响应。
      </p>
    </section>
  )
}
