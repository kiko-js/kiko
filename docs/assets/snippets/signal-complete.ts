import {
  createSignal,
  computed,
  effect,
  batch,
  onCleanup,
  on,
  untrack,
} from "@kikojs/signal"

interface CartItem {
  id: number
  name: string
  price: number
  qty: number
}

const cart = createSignal<CartItem[]>([{ id: 1, name: "键盘", price: 299, qty: 1 }])

// 派生：总价随购物车变化自动重算
const total = computed(() => cart.get().reduce((sum, item) => sum + item.price * item.qty, 0))

// 副作用：total 变化时更新标题；重跑前执行上一次注册的清理
const dispose = effect(() => {
  document.title = `购物车 ¥${total.get()}`
  onCleanup(() => console.log("title effect cleanup"))
})

// 批处理：多次写入合并为一次刷新（只重算一次 total）
batch(() => {
  cart.set([...cart.get(), { id: 2, name: "鼠标", price: 99, qty: 2 }])
})
// title = 购物车 ¥497

// 显式依赖：只在 source 变化时执行
const source = createSignal(0)
const disposeOn = effect(
  on(
    () => source.get(),
    () => console.log("total:", untrack(() => total.get())),
  ),
)

source.set(1) // "total: 497"

dispose()
disposeOn()
