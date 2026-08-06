/** @jsxImportSource @kikojs/dom */
import { Suspend, lazy, createSignal } from "@kikojs/dom"
import { computed } from "@kikojs/signal"

// lazy：代码分割。首次调用加载模块（并发调用共享同一次加载），之后走缓存；
// 加载失败会清除缓存，下次调用可重试。
// 实际工程中：const Card = lazy(() => import("./Card").then(m => m.default))
const MyCard = () => <div class="user-card">card</div>
const Card = lazy(() => Promise.resolve(MyCard))

const view = (
  <Suspend fallback={<p>加载中…</p>}>
    {/* 异步组件可直接作为 JSX 元素：jsx 返回 Promise<Node>，等待期间渲染 fallback */}
    <Card />
  </Suspend>
)

// children 也可以是信号：值变化时重新挂起，迟到的旧结果会被丢弃
const userId = createSignal(1)
const userCard = computed(() =>
  fetch(`/api/user/${userId.get()}`)
    .then(r => r.json())
    .then(user => <div class="user-card">{user.name}</div>),
)
const reactive = <Suspend fallback={<p>加载中…</p>}>{userCard}</Suspend>
