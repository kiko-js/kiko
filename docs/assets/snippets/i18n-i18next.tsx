/** @jsxImportSource @kikojs/dom */
import { computed, createSignal } from "@kikojs/signal"
import i18next from "i18next"

// 1) i18next 照常初始化：配置、资源、后端插件与视图层无关，原样复用。
await i18next.init({
  lng: "zh-CN",
  fallbackLng: "en",
  resources: {
    "zh-CN": { translation: { hello: "你好，{{name}}", items: "共 {{count}} 项" } },
    en: { translation: { hello: "Hello, {{name}}", items: "{{count}} item(s)" } },
  },
})

// 2) 桥：把「当前语言」暴露成 signal。i18next 是命令式的（当前值 + 事件），
//    kiko 是响应式的（signal），整座桥只需要这一处状态同步。
export const lang = createSignal(i18next.language)
i18next.on("languageChanged", lng => lang.set(lng))
// 语言不变、但资源异步到达（后端插件 / addResourceBundle）时同样要重算
i18next.on("loaded", () => lang.set(i18next.language))

// 3) t() → Signal.Computed：读取时先依赖 lang，语言一变该 computed 失效，
//    绑定它的文本节点 / 属性由 watcher 精准更新——组件体不重跑，也不需要 Provider。
//    options 用 getter 传入，可以在其中读任意 signal（插值随信号一起响应）。
export function t(key: string, options?: () => Record<string, unknown>) {
  return computed<string>(() => {
    lang.get()
    return i18next.t(key, options?.()) as string
  })
}

// 4) JSX 直接消费标准信号：children 与 props 都可绑定
export function Greeting() {
  const name = createSignal("Ada")
  return (
    <p title={t("hello", () => ({ name: name.get() }))}>
      {t("hello", () => ({ name: name.get() }))}
      <button onClick={() => i18next.changeLanguage(lang.get() === "zh-CN" ? "en" : "zh-CN")}>
        {t("items", () => ({ count: 3 }))}
      </button>
    </p>
  )
}
