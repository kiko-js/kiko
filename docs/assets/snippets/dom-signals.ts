import { createSignal, isSignal, createWatcher } from "@kikojs/dom"

// @kikojs/dom 自包含的最小 signal 封装（基于 signal-polyfill 重新实现）
const count = createSignal(0)
console.log(isSignal(count)) // true

const watcher = createWatcher(() => console.log("changed"))
watcher.watch(count)
count.set(1) // "changed"

watcher.unwatch(count)
