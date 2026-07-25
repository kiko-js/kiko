import { Suspend } from "@kikojs/dom"

// 注意：kiko 组件只会执行一次，因此这里的 await 只会在初始化时运行。
// 不要把 signal 作为 async 组件的依赖来驱动重新加载。
const UserCard = async () => {
  const user = await fetch("/api/user").then(r => r.json())
  return <div class="user-card">{user.name}</div>
}

<Suspend fallback={<p>加载中…</p>}>
  <UserCard />
</Suspend>
