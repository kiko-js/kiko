import { createSignal, createWatcher } from "@kikojs/signal"

const count = createSignal(0)

// 标准 watcher：手动 watch / unwatch，回调在信号变化后触发
const watcher = createWatcher(() => console.log("count changed"))

watcher.watch(count)
count.set(1) // "count changed"

watcher.unwatch(count) // 停止监听
