import { createSignal } from "@kikojs/dom"
import { computed } from "@kikojs/signal"

// 模块级信号：HMR 重求值时身份与值都保留（beginModule/endModule 作用域）
export const sharedClicks = createSignal(0)

export const doubled = computed(() => sharedClicks.get() * 2)
