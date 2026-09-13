/** @jsxImportSource @kikojs/dom */
import { computed, createSignal } from "@kikojs/signal"
import { renderToPage } from "@kikojs/dom/server"
import i18next from "i18next"

/** t(key) 返回的响应式文本：绑定到 lang signal 的 computed */
type ReactiveText = ReturnType<typeof computed<string>>

function Page(props: { t: (key: string) => ReactiveText }) {
  return <h1>{props.t("hello")}</h1>
}

/**
 * 并发 SSR 的请求级 i18n。
 *
 * - 用 `getFixedT(lng)` 绑定本请求语言，绝不 `changeLanguage()` 改全局实例
 *   （那会让并发请求互相串扰）。
 * - `lang` signal 必须在 `renderToPage` 的回调**内部**创建：`renderToPage`
 *   在同一回调内开启信号捕获窗口，创建在此的信号会随 HTML 序列化；客户端
 *   水合按位置恢复，首帧即服务端语言，无闪烁。
 * - 不要用模块级 lang signal：它在捕获窗口之外创建、不会进快照，且跨请求共享。
 */
export function renderPage(lng: string) {
  const fixedT = i18next.getFixedT(lng)
  return renderToPage(() => {
    const lang = createSignal(lng)
    const t = (key: string) =>
      computed<string>(() => {
        lang.get()
        return fixedT(key) as string
      })
    return <Page t={t} />
  })
}
