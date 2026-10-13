import { createSignal } from "@kikojs/dom"
import { computed } from "@kikojs/signal"

// 模块级信号：HMR 重新求值时 `beginModule` / `endModule` 作用域按「模块 + 创建序」
// 复用旧信号对象，身份与值都保留（改这里的初始值不会重置已有状态）。
export const sharedClicks = createSignal(0)

export const doubled = computed(() => sharedClicks.get() * 2)
