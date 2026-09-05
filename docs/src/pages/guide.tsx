/**
 * 指南页：从静态 guide.html 迁移的纯客户端组件版本。
 * 结构（section id / 锚点 / 文案）与原静态页 1:1 对应。
 */
import { render } from "@kikojs/dom"
import { Layout, Toc } from "../shared"
import { Code, CodeBlock } from "../code"
import type { TocItem } from "../shared"

const TOC: TocItem[] = [
  { id: "overview", label: "设计理念" },
  { id: "install", label: "安装" },
  { id: "first", label: "第一个组件" },
  { id: "reactivity", label: "响应式渲染" },
  { id: "control", label: "控制流" },
  { id: "async", label: "错误与异步" },
  { id: "style", label: "scoped 样式" },
  { id: "htm", label: "无构建环境" },
  { id: "lifecycle", label: "生命周期与清理" },
  { id: "state", label: "状态管理" },
  { id: "ecosystem", label: "生态" },
  { id: "next", label: "下一步" },
]

render(
  <Layout page="guide" mainClass="api-grid">
    <Toc items={TOC} />
    <div>
      <section id="overview" class="api-section">
        <h2>设计理念</h2>
        <p>
          kiko 是一个基于
          <a
            href="https://github.com/nicolo-ribaudo/signal-polyfill"
            target="_blank"
            rel="noopener"
          >
            signal-polyfill
          </a>
          （TC39 Signals 提案）的细粒度响应式 DOM 库。JSX 直接编译为真实 DOM 节点——没有虚拟
          DOM，没有 reconciliation。理解以下三条原则，就掌握了 kiko 的全部心智模型：
        </p>
        <ul style="color: var(--muted)">
          <li>
            <strong>无虚拟 DOM：</strong>JSX 工厂直接创建 <code>HTMLElement</code> /
            <code>Text</code> 节点，挂载后就是真实 DOM，没有 diff 过程。
          </li>
          <li>
            <strong>组件体惰性物化：</strong>没有 re-render 循环，组件体在消费点执行一次（挂载、
            父元素构建、控制流分支或水合采纳）。children 不先于父组件求值，未展示的分支 （如
            <code>Show</code> 的 fallback）组件体不执行；响应式由嵌入的 signal 细粒度驱动。
            需要节点对象时用 <code>realize()</code> 显式物化，或组件级 <code>ref</code> 拿根元素。
          </li>
          <li>
            <strong>标准信号：</strong>所有 API 返回标准 <code>Signal.State</code> /
            <code>Signal.Computed</code>，与 TC39 提案兼容，任何消费标准信号的库都可以互操作。
          </li>
        </ul>
        <div class="note">
          数据流：signal 写入 → 调度器批量刷新 → 对应绑定的
          <code>Watcher</code> 触发 → 更新单个文本节点 / 属性 / 子树。组件函数本身不会重新执行。
        </div>
      </section>

      <section id="install" class="api-section">
        <h2>安装</h2>
        <p>kiko 由两个核心包组成，按需安装：</p>
        <CodeBlock src="./assets/snippets/install.sh" lang="shell" />
        <ul style="color: var(--muted)">
          <li>
            <code>@kikojs/signal</code> — 信号原语、computed、effect、batch、createStore
            等应用层状态工具。
          </li>
          <li>
            <code>@kikojs/dom</code> — JSX 工厂、render、Show / For / Style / htm 等 DOM 能力。
            <strong>不依赖</strong> @kikojs/signal，自包含。
          </li>
        </ul>
        <p>
          在 <code>tsconfig.json</code> 中配置 JSX 编译目标（也可用文件顶部注释替代）：
        </p>
        <CodeBlock src="./assets/snippets/tsconfig.json" lang="json" />
        <p class="note">
          不想配置编译器？<code>dom</code> 标签模板可以在运行时完成同样的翻译，见
          <a href="#htm">无构建环境</a>。
        </p>
      </section>

      <section id="first" class="api-section">
        <h2>第一个组件</h2>
        <p>
          组件就是一个接收 props、返回 DOM 节点的普通函数。<code>createSignal</code>
          创建可写状态，<code>render</code> 把组件树挂载进容器：
        </p>
        <CodeBlock src="./assets/snippets/counter.tsx" lang="tsx" />
        <p>
          点击按钮时只有显示数字的 <code>{"<span>"}</code> 文本节点更新——组件函数不会重新执行，
          也不会有任何 diff 开销。这是 kiko 的核心工作方式。
        </p>
      </section>

      <section id="reactivity" class="api-section">
        <h2>响应式渲染</h2>
        <p>signal 可以出现在 JSX 的任何位置，运行时自动为每个绑定创建 watcher：</p>
        <CodeBlock src="./assets/snippets/dom-props.tsx" lang="tsx" />
        <table>
          <thead>
            <tr>
              <th>位置</th>
              <th>行为</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>children</code> 中
              </td>
              <td>signal 值 → 创建 Text 节点并订阅；值变化时更新该文本节点。</td>
            </tr>
            <tr>
              <td>
                <code>children</code> 中，值为 <code>Node</code> / 数组
              </td>
              <td>
                基于 marker 的<strong>结构替换</strong>
                ：signal 变化时整棵子树被替换（无需手动 DOM 操作，Show / For 的底层机制）。
              </td>
            </tr>
            <tr>
              <td>任意 prop</td>
              <td>值变化时细粒度更新属性（class、style、事件、data-* 等）。</td>
            </tr>
          </tbody>
        </table>
        <div class="note">
          事件处理器（<code>onXxx</code>）的值也可以是 signal：变化时旧监听器会被移除、新监听器
          生效，不会重复绑定造成泄漏。
        </div>
      </section>

      <section id="control" class="api-section">
        <h2>控制流</h2>
        <p>
          kiko 没有模板指令。条件与列表通过<strong>组件</strong>
          表达，内部仍然只是信号 + 真实 DOM：
        </p>
        <h3>Show — 条件渲染</h3>
        <CodeBlock src="./assets/snippets/dom-show.tsx" lang="tsx" />
        <h3>For — 列表渲染</h3>
        <CodeBlock src="./assets/snippets/dom-for.tsx" lang="tsx" />
        <p>
          <code>For</code> 的 <code>index</code> 是访问器（调用返回当前序号）。默认按
          <strong>条目身份</strong>
          复用节点——对象移动/重排不重建、children 不重跑，重复条目回退整表重建；需要自定义
          键控（item 变为访问器 <code>{"() => T"}</code>）时传 <code>getKey</code>（详见
          <a href="./dom.html#for">dom API 参考</a>）。
        </p>
      </section>

      <section id="async" class="api-section">
        <h2>错误与异步</h2>
        <h3>ErrorBoundary — 渲染错误边界</h3>
        <CodeBlock src="./assets/snippets/dom-errorboundary.tsx" lang="tsx" />
        <h3>Suspend — 异步挂起</h3>
        <CodeBlock src="./assets/snippets/dom-suspend.tsx" lang="tsx" />
        <div class="note">
          与 React 不同，kiko 组件函数只执行一次，因此 Suspend 只适合<strong>一次性初始化</strong>。
          需要响应式刷新时请使用 <code>effect</code> 或<code>Show</code>。
        </div>
      </section>

      <section id="style" class="api-section">
        <h2>scoped 样式</h2>
        <p>
          <code>{"<style>"}</code> 默认启用 Vue 风格的 scoped 模式：选择器被改写并限定到
          <strong>最近祖先元素</strong>（该元素自动获得 <code>data-kiko-vN</code>
          属性）。Show / For 动态插入的节点自动被覆盖，无需模板编译器。加
          <code>global</code> 属性则直接全局注入：
        </p>
        <CodeBlock src="./assets/snippets/dom-style.tsx" lang="tsx" />
        <table>
          <thead>
            <tr>
              <th>写法</th>
              <th>含义</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>.card</code>
              </td>
              <td>匹配作用域根元素及其子孙。</td>
            </tr>
            <tr>
              <td>
                <code>{"& .title"}</code>
              </td>
              <td>
                <code>{"&"}</code> 即作用域根元素本身。
              </td>
            </tr>
            <tr>
              <td>
                <code>:deep(.x)</code> / <code>:global(.x)</code>
              </td>
              <td>穿透作用域，保持无作用域。</td>
            </tr>
            <tr>
              <td>
                <code>{"<style global>"}</code>
              </td>
              <td>整段样式不做改写，全局注入。</td>
            </tr>
          </tbody>
        </table>
        <p>
          实现基于构造式样式表（<code>adoptedStyleSheets</code>），不支持的环境自动降级为真实
          <code>{"<style>"}</code> 元素。完整规则见
          <a href="./dom.html#style">dom API 参考</a>。
        </p>
      </section>

      <section id="htm" class="api-section">
        <h2>无构建环境</h2>
        <p>
          没有 JSX 编译器（纯浏览器、无构建脚本、REPL）？可以结合
          <a href="https://github.com/developit/htm" target="_blank" rel="noopener">
            htm
          </a>
          在<strong>运行时</strong>完成同样的翻译。kiko 不内置 htm 适配器：自行安装 htm，写约 10
          行胶水代码把它接到 <code>jsx</code> 工厂，产出的元素与 JSX 编译完全等价——组件、
          信号、scoped 样式、Show / For 行为完全一致：
        </p>
        <Code code="bun add htm" lang="shell" />
        <CodeBlock src="./assets/snippets/htm.ts" lang="ts" />
        <p>
          完整可运行示例见 <a href="./examples.html#htm">示例页</a> 与<code>examples/htm</code>{" "}
          目录；语法细节与限制见
          <a href="./dom.html#htm">dom API 参考</a>。
        </p>
      </section>

      <section id="lifecycle" class="api-section">
        <h2>生命周期与清理</h2>
        <h3>挂载与卸载</h3>
        <p>
          <code>render</code> 返回 <code>dispose()</code>：卸载整棵树并清理所有 watcher、事件
          监听与清理回调。
        </p>
        <CodeBlock src="./assets/snippets/dom-render.tsx" lang="tsx" />
        <h3>ref 清理</h3>
        <p>ref 回调返回的函数会被注册为清理回调，子树卸载时自动调用：</p>
        <CodeBlock src="./assets/snippets/dom-ref.tsx" lang="tsx" />
        <h3>effect 清理</h3>
        <p>
          在 @kikojs/signal 中，effect 重跑前与 dispose 时执行 <code>onCleanup</code>：
        </p>
        <CodeBlock src="./assets/snippets/signal-cleanup.ts" lang="ts" />
      </section>

      <section id="state" class="api-section">
        <h2>状态管理</h2>
        <p>
          应用层状态建议放在 <a href="./signal.html">@kikojs/signal</a>：<code>computed</code>
          派生、<code>effect</code> 副作用、<code>batch</code> 批量刷新、<code>createStore</code>
          响应式对象，全部基于标准信号：
        </p>
        <CodeBlock src="./assets/snippets/signal-computed.ts" lang="ts" />
        <CodeBlock src="./assets/snippets/signal-batch.ts" lang="ts" />
        <p>
          共享状态（主题、语言、当前用户、API client）直接用<strong>模块级信号</strong>
          即可——全局可见、默认响应式、无需 Provider 嵌套。kiko 没有 re-render 周期，
          组件函数只执行一次，不存在传统 context 要解决的“避免重渲染的 prop 传递”问题：
        </p>
        <CodeBlock src="./assets/snippets/signal-context.ts" lang="ts" />
        <p>
          @kikojs/dom 的 JSX 直接消费这些标准信号——无需适配层。把 signal 放进
          <code>children</code> 或 props 即可。
        </p>
      </section>

      <section id="ecosystem" class="api-section">
        <h2>生态</h2>
        <h3>路由</h3>
        <p>
          <a href="./router.html">@kikojs/router</a> 是基于 signal 的声明式路由：路由表 + Router /
          Link / Outlet 组件，支持嵌套、动态参数、守卫与重定向。
        </p>
        <CodeBlock src="./assets/snippets/router-basic.tsx" lang="tsx" />
        <h3>React 桥接</h3>
        <p>
          <code>ReactPortal</code> 把 React 组件嵌入 kiko 树，signal prop 变化自动触发 React
          重渲染（<code>react</code> / <code>react-dom</code> 为可选 peer 依赖）：
        </p>
        <CodeBlock src="./assets/snippets/dom-react.tsx" lang="tsx" />
        <h3>本地示例项目</h3>
        <ul style="color: var(--muted)">
          <li>
            <code>examples/basic</code> — 计数器（Bun bundler + dev server）
          </li>
          <li>
            <code>examples/htm</code> — 无构建 htm 模板字符串
          </li>
          <li>
            <code>examples/react-portal</code> — React 桥接
          </li>
          <li>
            <code>examples/tailwind</code> — Tailwind + kiko
          </li>
        </ul>
      </section>

      <section id="next" class="api-section">
        <h2>下一步</h2>
        <p>按需阅读各包的完整 API 参考：</p>
        <ul style="color: var(--muted)">
          <li>
            <a href="./signal.html">@kikojs/signal API 参考</a> — 信号、派生、副作用、状态
          </li>
          <li>
            <a href="./dom.html">@kikojs/dom API 参考</a> — JSX、渲染、控制流、样式
          </li>
          <li>
            <a href="./router.html">@kikojs/router API 参考</a> — 路由表、组件、守卫
          </li>
          <li>
            <a href="./examples.html">示例页</a> — 可运行代码与实时 demo
          </li>
        </ul>
      </section>
    </div>
  </Layout>,
  document.getElementById("root")!,
)
