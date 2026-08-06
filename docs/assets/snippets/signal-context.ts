import { createSignal } from "@kikojs/dom"

// 模块级信号就是共享状态（context 的替代）：全局可见、默认响应式、无 Provider 嵌套
export const theme = createSignal<"light" | "dark">("light")
export const locale = createSignal("zh-CN")
export const api = { base: "/api" } // 不变的服务实例直接用普通常量

// JSX 中绑定信号即响应式：<div className={theme}>——theme 变化时仅更新该属性
// 非响应式读取用 theme.get()（组件函数只执行一次，取一次快照即可）
const current = theme.get()
