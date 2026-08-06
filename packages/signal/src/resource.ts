import { Signal } from "signal-polyfill"
import { effect } from "./effect"
import { onCleanup } from "./scope"

/**
 * 异步数据的信号封装：把一次（或依赖驱动的多次）异步拉取映射为
 * `data` / `loading` / `error` 三个信号。
 *
 * `source` 为 getter：其中读取的信号依赖变化时自动重新拉取，并发安全
 * （旧请求的迟到结果不会覆盖新请求）。`initial` 在首次加载完成前作为
 * `data` 的初值。
 *
 * 在 effect 内创建时随作用域自动 dispose（`onCleanup`）；在 effect 外创建
 * （模块顶层 / 组件顶层）需手动调用 `dispose()`。
 */
export interface ResourceOptions<T> {
  /** 首次加载完成前 `data` 的值 */
  initial?: T
  /** 依赖源 getter：其信号依赖变化时自动重新拉取 */
  source?: () => unknown
}

export interface Resource<T> {
  /** 当前数据（加载中为 initial / undefined） */
  data: Signal.State<T | undefined>
  /** 是否有请求在途 */
  loading: Signal.State<boolean>
  /** 最近一次错误；无错误为 null */
  error: Signal.State<unknown>
  /** 手动重新拉取（使用当前 source 值） */
  refetch(): void
  /** 停止监听与在途请求 */
  dispose(): void
}

export function createResource<T>(
  fetcher: (source: unknown) => Promise<T>,
  options: ResourceOptions<T> = {},
): Resource<T> {
  const data = new Signal.State<T | undefined>(options.initial)
  const loading = new Signal.State<boolean>(true)
  const error = new Signal.State<unknown>(null)

  let seq = 0
  let disposed = false

  async function run(source: unknown): Promise<void> {
    const mySeq = ++seq
    loading.set(true)
    error.set(null)
    try {
      const value = await fetcher(source)
      if (disposed || mySeq !== seq) return
      data.set(value)
    } catch (err) {
      if (disposed || mySeq !== seq) return
      error.set(err)
    } finally {
      if (!disposed && mySeq === seq) loading.set(false)
    }
  }

  function refetch(): void {
    run(options.source?.() ?? undefined)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    stop()
  }

  const stop = effect(() => {
    run(options.source?.() ?? undefined)
  })
  onCleanup(dispose)

  return { data, loading, error, refetch, dispose }
}
