# 设计记录：作用域原语（provideScope）——搁置，待讨论

- **日期**: 2026-09-04
- **状态**: 搁置（NOT PLANNED — 重新讨论并达成一致前，禁止直接实现）
- **决策**: 删除 `@kikojs/dom` 的 React 风格 context（`createContext` / `useContext`），
  不引入替代的作用域原语。i18n 等依赖注入需求用既有模式覆盖（见下）。

## 背景

kiko 组件只执行一次，context 的作用域查找只发生一次（创建时刻），其价值只剩
「深层穿透」。2026-09-04 讨论决定：隐式树遍历不值得保留，显式数据流优先。

覆盖矩阵（当前方案）：

| 场景                                 | 模式                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 应用级依赖（i18n、主题、API client） | 模块级 signal + 工厂：`export const locale = signal("zh-CN")`（响应式、全局可见、无 Provider） |
| SSR 请求级作用域                     | AsyncLocalStorage 请求作用域，如 `withSSRRouter`（`@kikojs/router/server`），并发隔离已验证    |
| 子树级覆盖                           | 显式 props 传 signal（传引用，中间层只透传）                                                   |

docs 站 `guide.html` 与 `assets/snippets/signal-context.ts` 已按此口径撰写。

## 搁置的方案草案：模块级 signal + key 作用域

设想：把「作用域」从树的位置改绑到执行的作用域（ALS），key 即模块级 signal 本身：

```ts
export const locale = signal("zh-CN")

const t = readScope(locale) // ALS override → signal 默认值，O(1)，无树遍历

withScope(locale, "en", () => renderToFragment(() => <Page />)) // 请求/子树级覆盖
```

可行性依赖 kiko 的前提：组件只跑一次，作用域查找只需命中创建时刻——
此时「执行作用域」与「树位置」重合。

## 为什么搁置（重新讨论时必须先回答的问题）

1. **反应期读取失效**：事件回调由浏览器事件循环触发，不在任何 `withScope`
   异步链内，ALS store 为空 → 静默落回全局默认值。SSR 下对、客户端下错，
   属于毒 bug 类。需要「作用域值只在组件创建期读取，反应期用创建期捕获的
   signal/闭包」的纪律——目前无法用类型系统强制。是否可接受？如何防御？
2. **API 形状未定**（用户明确认为现有草案不够好，实现前必须重新设计）：
   - key 是 signal 本身、symbol、还是显式声明的作用域对象？
   - override 是裸值还是另一个 signal？嵌套/兄弟作用域的声明方式？
   - 客户端渲染期 `withScope` 与微任务渲染边界（Outlet 的
     `queueMicrotask` 渲染、signal 调度器的微任务 flush）如何保证命中？
3. **泛化归属未定**：请求级作用域目前由各包自建（`@kikojs/router/server`）。
   是否值得进 `@kikojs/dom/server` 成为通用设施，还是保留包内自建？
   没有第二个真实消费者之前，定 API 形状是投机。

## 触发条件

出现 **≥2 个真实消费场景**（非假想需求）时，重新开启讨论。

## 流程约束

**讨论优先于实现**：本记录的存在即约定——任何后续会话在实现该原语前，
必须先与用户就上述问题达成一致，不得以「记录里已有草案」为由直接实现。
