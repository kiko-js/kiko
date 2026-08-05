import { createStore, computed, ref } from "@kikojs/signal"

// 细粒度响应式对象：每层都是代理节点，链式访问深层属性
const store = createStore({
  name: "Alice",
  user: { age: 30, role: "admin" },
  count: 0,
})

// 细粒度派生：只依赖 user.age
const decade = computed(() => Math.floor(store.user.age.get() / 10))

console.log(store.name.get()) // "Alice"
console.log(store.user.role.get()) // "admin"
console.log(decade.get()) // 3

// 写入单个属性 — 只触发该属性的 watcher
store.name.set("Bob")

// 更新嵌套属性 — user.age watcher 触发，user watcher 也触发（向上传播）
store.user.age.set(35)
console.log(decade.get()) // 3（不变）

// 替换整个嵌套对象 — 运行时接受任意对象并自动包裹（新形状可链式访问）。
// 类型上仍按初始形状约束，示例中显式断言以演示运行时行为。
store.user.set({ name: "Carol", age: 28, role: "user" } as never)
console.log((store.user as never as { name: { get(): string } }).name.get()) // "Carol"

// ref() 包裹的值不会被代理 — 适合类实例、自引用结构等非平凡对象
class Clock {
  now = Date.now()
}
const store2 = createStore({ clock: ref(new Clock()) })
console.log(store2.clock.get() instanceof Clock) // true —— 原引用

// 在 JSX 中通过 .signal 桥接：<div>{store.name.signal}</div> 自动订阅
