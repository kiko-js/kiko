import { createResource, createSignal } from "@kikojs/signal"

const userId = createSignal(1)

// source 中的信号依赖变化时自动重新拉取；并发安全（旧请求迟到结果不覆盖新请求）
const user = createResource(
  async id => {
    const res = await fetch(`/api/users/${id}`)
    return res.json()
  },
  { source: () => userId.get() },
)

// data / loading / error 都是标准信号，可直接交给 JSX 或 computed
user.data.get() // 当前数据（加载中为 initial / undefined）
user.loading.get() // 是否有请求在途
user.error.get() // 最近一次错误；无错误为 null
user.refetch() // 手动重新拉取
user.dispose() // 停止监听与在途请求（effect 内创建时自动清理）
