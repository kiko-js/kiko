/** @jsxImportSource @kikojs/dom */
import { Suspend } from "@kikojs/dom"

// 注意：kiko 组件函数只执行一次，这里的 await 只在初始化时运行一次。
// 不要把 signal 作为 async 组件的依赖来驱动重新加载。
const UserCard = async () => {
  const user = await fetch("/api/user").then((r) => r.json())
  return <div class="user-card">{user.name}</div>
}

const view = (
  <Suspend fallback={<p>加载中…</p>}>
    {/* children 可以是 Promise<Node>；等待期间渲染 fallback */}
    {UserCard()}
  </Suspend>
)
