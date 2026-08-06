import type { AsyncComponent, Component, Props } from "./jsx-runtime"

/**
 * 代码分割：`lazy(loader)` 返回一个异步组件，首次调用时加载模块（并发调用共享
 * 同一次加载），之后直接使用缓存的组件实例。与 `<Suspend>` 组合使用：
 *
 * ```tsx
 * const Card = lazy(() => import("./Card").then(m => m.default))
 * <Suspend fallback={<p>加载中…</p>}><Card /></Suspend>
 * ```
 *
 * 加载失败会清除缓存，下次调用可重试。两端共享（DOM-free）。
 */
export function lazy<P extends Props = Props>(
  loader: () => Promise<Component<P>>,
): AsyncComponent<P> {
  let component: Component<P> | null = null
  let loading: Promise<Component<P>> | null = null

  return (props?: P): Promise<Node> => {
    if (component) return Promise.resolve(component(props as P))
    if (!loading) {
      loading = loader().then(m => {
        component = m
        return m
      })
      // 消费拒绝，避免 unhandled rejection；清除缓存允许下次调用重试
      loading.catch(() => {
        loading = null
      })
    }
    return loading.then(m => m(props as P))
  }
}
