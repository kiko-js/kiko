import { createStore, computed } from "@kikojs/signal"

const store = createStore({
  name: "Alice",
  user: { age: 30, role: "admin" },
  count: 0,
})

// 细粒度派生：只依赖 user.age
const decade = computed(() => Math.floor(store.user.age.get() / 10))

// 读取
console.log(store.name.get())          // "Alice"
console.log(store.user.role.get())     // "admin"
console.log(decade.get())              // 3

// 更新单个属性
store.name.set("Bob")

// 更新嵌套属性 — user.age watcher 触发，user watcher 也触发（向上传播）
store.user.age.set(35)
console.log(decade.get()) // 3（不变）

// 替换整个嵌套对象 — 深层属性同样可链式访问
store.user.set({ name: "Carol", age: 28, role: "user" })
console.log(store.user.name.get()) // "Carol"

// 在 JSX 中：<div>{store.name.signal}</div> 自动订阅
