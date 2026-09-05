import { render } from "@kikojs/dom"
import { Layout } from "../shared"
import { CodeBlock } from "../code"
import { Counter } from "../counter"
import { HtmDemo } from "../htm-demo"

render(
  <Layout page="examples">
    <section class="hero">
      <h1>示例</h1>
      <p>从最小计数器到控制流与 React 桥接，快速了解 kiko 的使用方式。</p>
    </section>

    <section>
      <h2>计数器</h2>
      <p>
        组件函数只执行一次，只有 <code>count</code> 文本节点会随 signal 更新。
      </p>
      <div class="demo-card">
        <Counter />
      </div>
      <CodeBlock src="./assets/snippets/counter.tsx" lang="tsx" />
    </section>

    <section>
      <h2>Show 条件渲染</h2>
      <p>根据 signal 布尔值切换 UI，支持函数 children 与 fallback。</p>
      <CodeBlock src="./assets/snippets/dom-show.tsx" lang="tsx" />
    </section>

    <section>
      <h2>For 列表渲染</h2>
      <p>
        列表变化时做最小 DOM 操作，<code>index</code> 是访问器。
      </p>
      <CodeBlock src="./assets/snippets/dom-for.tsx" lang="tsx" />
    </section>

    <section>
      <h2>ErrorBoundary / Suspend</h2>
      <p>渲染错误捕获与一次性异步加载：</p>
      <CodeBlock src="./assets/snippets/dom-errorboundary.tsx" lang="tsx" />
      <CodeBlock src="./assets/snippets/dom-suspend.tsx" lang="tsx" />
      <p class="note">
        kiko 组件函数只执行一次，因此 Suspend 仅适合一次性初始化。需要响应式刷新时请使用
        <code>effect</code> 配合 signal。
      </p>
    </section>

    <section id="htm">
      <h2>htm 模板字符串（无构建 JSX）</h2>
      <p>
        没有 JSX 编译器？结合 htm 的胶水代码（约 10 行，见下方片段）在运行时完成 JSX
        翻译——组件、信号、scoped css、Show / For 行为完全一致。可在纯浏览器中直接使用。
      </p>
      <div class="demo-card">
        <HtmDemo />
      </div>
      <CodeBlock src="./assets/snippets/htm.ts" lang="ts" />
    </section>

    <section>
      <h2>React 桥接</h2>
      <p>在 kiko 树中嵌入 React 组件，实现生态兼容（signal prop 变化自动重渲染）。</p>
      <CodeBlock src="./assets/snippets/dom-react.tsx" lang="tsx" />
    </section>

    <section>
      <h2>/signal 组合使用</h2>
      <p>@kikojs/signal 的派生与批处理示例：</p>
      <CodeBlock src="./assets/snippets/signal-complete.ts" lang="ts" />
    </section>

    <section>
      <h2>本地示例项目</h2>
      <p>
        仓库 <code>examples/</code> 目录下的完整可运行项目：
      </p>
      <table>
        <thead>
          <tr>
            <th>目录</th>
            <th>内容</th>
            <th>运行</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>examples/basic</code>
            </td>
            <td>计数器（Bun bundler + dev server）</td>
            <td>
              <code>bun run dev</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>examples/htm</code>
            </td>
            <td>无构建 htm 模板字符串（Todo + scoped 样式）</td>
            <td>
              <code>bun run dev</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>examples/react-portal</code>
            </td>
            <td>React 组件桥接</td>
            <td>
              <code>bun run dev</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>examples/tailwind</code>
            </td>
            <td>Tailwind + kiko</td>
            <td>
              <code>bun run dev</code>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </Layout>,
  document.getElementById("root")!,
)
