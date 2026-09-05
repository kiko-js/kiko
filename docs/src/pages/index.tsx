import { render } from "@kikojs/dom"
import { Layout } from "../shared"
import { CodeBlock } from "../code"
import { Counter } from "../counter"

const FEATURES = [
  {
    title: "真实 DOM",
    text: "JSX 工厂直接创建 HTMLElement 与 Text 节点，没有虚拟 DOM 和 diff 开销。",
  },
  {
    title: "标准信号",
    text: "基于 signal-polyfill（TC39 Signals 提案），返回标准 Signal.State / Signal.Computed。",
  },
  {
    title: "细粒度更新",
    text: "每个 signal 绑定独立 watcher，变化时只更新对应的文本、属性或子树。",
  },
  {
    title: "scoped 样式",
    text: "<style> 默认 Vue 风格 scoped：构造式样式表 + 选择器改写，无需模板编译器。",
  },
  {
    title: "控制流组件",
    text: "Show、For、ErrorBoundary 与 Suspend，条件渲染、列表渲染、错误边界与异步挂起均基于 signal 与真实 DOM。",
  },
  {
    title: "无构建可用",
    text: "dom 标签模板在运行时翻译 JSX 语法，纯浏览器环境直接使用；React 组件也能通过 ReactPortal 嵌入。",
  },
]

const DOCS = [
  {
    href: "./guide.html",
    title: "指南",
    text: "设计理念与完整上手：第一个组件、响应式渲染、控制流、scoped 样式、生命周期。",
  },
  {
    href: "./signal.html",
    title: "@kikojs/signal",
    text: "状态管理 API：createSignal、computed、effect、batch、untrack、on、createStore。",
  },
  {
    href: "./dom.html",
    title: "@kikojs/dom",
    text: "DOM API：JSX 工厂、render、Show / For / ErrorBoundary / Suspend、Style、htm。",
  },
  {
    href: "./router.html",
    title: "@kikojs/router",
    text: "声明式路由：路由表、Router / Link / Outlet、hooks、守卫、工具函数。",
  },
  {
    href: "./examples.html",
    title: "示例",
    text: "可运行代码与实时 demo：计数器、控制流、htm 模板字符串、React 桥接。",
  },
]

render(
  <Layout page="index">
    <section class="hero">
      <h1>kiko</h1>
      <p>
        基于 signal-polyfill 的细粒度响应式 DOM 库。JSX 直接编译为真实 DOM，无需虚拟
        DOM，组件体惰性物化、信号驱动精准更新。
      </p>
      <div class="buttons">
        <a class="btn btn-primary" href="./guide.html">
          快速开始
        </a>
        <a class="btn btn-secondary" href="./examples.html">
          查看示例
        </a>
      </div>
    </section>

    <section>
      <div class="demo-card">
        <h2>实时计数器</h2>
        <p>下面的计数器使用 @kikojs/dom 渲染，signal 更新会自动驱动 DOM 细粒度刷新。</p>
        <Counter />
        <p class="note">无需重新执行组件函数，只有显示数字的文本节点会更新。</p>
      </div>
    </section>

    <section>
      <h2>核心特性</h2>
      <div class="features">
        {FEATURES.map(f => (
          <div class="card">
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
    </section>

    <section>
      <h2>文档结构</h2>
      <p>从概念到 API，按需阅读：</p>
      <div class="features">
        {DOCS.map(d => (
          <div class="card">
            <h3>
              <a href={d.href}>{d.title}</a>
            </h3>
            <p>{d.text}</p>
          </div>
        ))}
      </div>
    </section>

    <section>
      <h2>快速开始</h2>
      <p>
        安装依赖并在 TSX 中设置 <code>@jsxImportSource</code>（详见
        <a href="./guide.html#install">指南</a>）：
      </p>
      <CodeBlock src="./assets/snippets/install.sh" lang="shell" />
      <p style="margin-top: 22px">一个完整的计数器组件：</p>
      <CodeBlock src="./assets/snippets/counter.tsx" lang="tsx" />
    </section>
  </Layout>,
  document.getElementById("root")!,
)
