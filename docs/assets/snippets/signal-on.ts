import { createSignal, effect, on, untrack } from "@kikojs/signal"

const source = createSignal(0)
const other = createSignal(0)

// on 返回 EffectFn，需配合 effect 使用：
// 只在声明依赖（deps）变化时执行，fn 内的其他读取不建立依赖
const dispose = effect(
  on(
    () => source.get(),
    (prev) => {
      console.log("prev:", prev, "now:", source.get(), "other:", untrack(() => other.get()))
    },
  ),
)

source.set(1) // "prev: 0 now: 1 other: 0"
other.set(99) // 不触发

dispose()
