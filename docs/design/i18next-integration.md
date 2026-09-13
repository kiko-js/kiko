# 设计记录：i18next 接入 —— signal 桥 + 文档生态示例（不建独立包）

- **日期**: 2026-09-13
- **状态**: 已决策（按用户 2026-09-13 指令落地）
- **决策**: 不为 i18next 新建 `@kikojs/i18n` 包。以「signal 桥 + 类型检查片段 + 指南生态章节」
  的形式提供兼容支持：桥接代码约 15 行，无 Provider、无作用域原语，符合
  `context-scope.md` 的既有口径（i18n 被明确列为「模块级 signal + 工厂」场景）。

## 背景

i18next 是命令式 API：`t(key)` 同步返回当前语言下的字符串，语言通过
`changeLanguage()` 切换并派发 `languageChanged` 事件。kiko 组件只执行一次，没有
re-render 周期，因此 react-i18next 那套 `useTranslation()` + 重渲染的绑定方式在这里
不成立，也不是必需的。

kiko 的响应式单位是 signal：放进 children / props 的 signal 会建立 watcher，变化时只
更新对应文本节点或属性。所以两者之间只差一个「当前语言 → signal」的同步点。

## 桥接原理（已实测）

```ts
const lang = createSignal(i18next.language)
i18next.on("languageChanged", lng => lang.set(lng))
i18next.on("loaded", () => lang.set(i18next.language)) // 资源异步到达（语言未变）也要重算

function t(key: string, options?: () => Record<string, unknown>) {
  return computed<string>(() => {
    lang.get()
    return i18next.t(key, options?.()) as string
  })
}
```

- **读取依赖**：computed 体先 `lang.get()`，语言一变该 computed 失效，绑定的文本 /
  属性被 watcher 精准更新；组件函数不会重跑。
- **options 用 getter**：`t("hello", () => ({ name: name.get() }))` 让插值也能读 signal，
  于是「语言 + 任意业务信号」共享同一条响应式依赖链。
- **无需 Provider / context**：语言是应用级依赖，模块级 signal 即可全局可见、默认响应式；
  子树级覆盖用显式 props 传 signal（见 `context-scope.md` 覆盖矩阵）。

实测（happy-dom + `renderToFragment`，PoC 已跑通后删除）：

| 场景                                              | 结果                                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| 客户端 `{t("hello")}` 作 children，切换语言       | 文本节点自动更新                                               |
| 客户端 `title={t("hello")}` 作属性                | 属性自动更新                                                   |
| 服务端 `renderToFragment` 内 computed 文本 / 属性 | 正确输出（`<p title="Hello"><!---->Hello</p>`）                |
| 并发 SSR 请求级语言                               | `getFixedT(lng)` + 回调内建 signal，两请求各出各的语言，无串扰 |

覆盖的 i18next 能力：插值、复数、命名空间、fallback、格式化、后端插件（只消费 `t()`），
以及 typed keys（`CustomTypeOptions` 模块增强直接生效，`t` 的 key 参数沿用 i18next 泛型）。

## 为什么不是独立包

| 维度           | 独立包 `@kikojs/i18n`                                                            | 文档生态示例（本次采用）                                         |
| -------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 代码量         | 桥约 15 行，其余是包脚手架（build.ts / tsconfig / changeset / publish / CI）     | 0 新增运行时代码，2 个类型检查片段                               |
| 维护面         | i18next v26 仍在演进，需长期跟进破坏性变更与类型泛型                             | 只依赖 `t()` 与 `languageChanged` / `loaded` 两个稳定事件        |
| API 形状风险   | 被迫提前定死 typed key、namespace 模型、SSR scope、`<Trans>` 等（仅 1 个消费方） | 用户按项目自取所需，不被半成品 API 绑定                          |
| SSR 请求作用域 | 需要自建 ALS 入口（如 router/server），且会触发「通用作用域设施」的架构讨论      | 给出 `getFixedT` + 回调内建 signal 的 recipe，不新增设施         |
| 可发现性       | npm 包名 + README                                                                | 指南「生态」章节 + 可运行片段（htm / lucide / ReactPortal 同款） |
| 强制力         | 有运行时测试保障                                                                 | 片段仅类型检查，无运行时测试                                     |

结论：当前收益不足以抵消独立包的长期维护成本；而片段随 `docs/tsconfig.json` 一起被
`tsc --noEmit` 检查，能保证与真实 i18next 类型及 kiko API 不漂移。这与 `context-scope.md`
「没有第二个真实消费者之前，定 API 形状是投机」的流程约束一致。

## 已知边界（桥接方案不触发，但需记录）

1. **组件不能返回裸 computed**：`toNodes` 不处理 signal，`<T>` 组件若 `return t("k")`
   会在 `<Show>` / `<For>` 路径被字符串化成 `[object Object]`（元素 children 路径因走
   `appendChild` 而正常）。这是一致性缺口；当前方案不定义 `<T>` 组件，直接用
   `{t("k")}` 放在元素内即可。若未来要支持，需在 `toNodes` 增加 signal 分支（核心改动，
   单独讨论）。
2. **`For` 的 entry 不能是 DocumentFragment**：组件返回 `<>…</>` 时 fragment 的子节点被
   搬家、entry 只记录空 fragment，移除时漏删。既有核心缺陷，与 i18n 无关，另行修复。
3. **SSR 不要用模块级语言 signal**：模块级 signal 在信号捕获窗口之外创建、不会进快照，
   且跨请求共享。请求级必须 `getFixedT(lng)` + 在 `renderToPage` 回调内创建 signal。
4. **`<Trans>` / react-i18next 组件不适用**：它们是 React 重渲染语义的组件，迁移时对应
   的是「signal 桥 + JSX 组合」，不提供同名 shim。

## 何时升级为独立包（触发条件）

满足任一条件时重开讨论、抽取 `@kikojs/i18n`：

1. 出现 **≥2 个真实消费方**（自有项目或第三方）收敛到同一份适配器；
2. 指南片段膨胀到 **>150 行**，或需要运行时测试（namespace 预加载协调、`<Trans>` 等价物、
   懒加载资源就绪态）；
3. i18next 出现破坏性变更，需要版本化兼容层；
4. 需要把请求级作用域沉淀为通用设施——届时与 `context-scope.md` 的「≥2 消费场景」一并
   重开，i18n 可作为第二个真实场景（第一个是 `@kikojs/router/server`）。

## 落地物

- `docs/assets/snippets/i18n-i18next.tsx`——客户端 signal 桥（类型检查）
- `docs/assets/snippets/i18n-i18next-ssr.tsx`——SSR 请求级接入（类型检查）
- `docs/src/pages/guide.tsx`「生态 → 国际化」章节引用上述片段
