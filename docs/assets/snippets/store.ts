import { createStore, computed } from "@kikojs/signal"

const store = createStore({
  name: "Alice",
  user: { age: 30, role: "admin" },
  count: 0,
})

// 细粒度派生：只依赖 user.age
const decade = computed(() => Math.floor(store.user.get().age.get() / 10))

// 读取
console.log(store.name.get())          // "Alice"
console.log(store.user.get().role.get()) // "admin"
console.log(decade.get())               // 3

// 更新单个属性
store.name.set("Bob")

// 更新嵌套属性 — 只触发 user.age 的 watcher
store.user.get().age.set(35)
console.log(decade.get()) // 3（不变）

// 替换整个嵌套对象 — 自动包裹为嵌套 store
store.user.set({ name: "Carol", age: 28, role: "user" })
console.log(store.user.get().name.get()) // "Carol"

// 在 JSX 中：<div>{store.name}</div> 自动订阅
