/**
 * 教程页：从安装开始，用 Bun 搭一个 @kikojs/dom + @kikojs/signal +
 * @kikojs/router 的单页应用。
 *
 * 页面展示的代码片段都在 docs/assets/snippets/tutorial/ 下，与
 * examples/spa/ 逐文件对应（两边都会 typecheck）。
 */
import { render } from "@kikojs/dom"
import { Layout, Toc } from "../shared"
import type { TocItem } from "../shared"
import { Code, CodeBlock } from "../code"

const TOC: TocItem[] = [
  { id: "overview", label: "教程概览" },
  { id: "install", label: "1. 安装依赖" },
  { id: "config", label: "2. JSX 与 TS 配置" },
  { id: "server", label: "3. Bun 开发服务器" },
  { id: "store", label: "4. 共享状态 signal" },
  { id: "home", label: "5. 首页：dom + signal" },
  { id: "tasks", label: "6. 任务页：控制流" },
  { id: "user", label: "7. 动态参数与查询" },
  { id: "notfound", label: "8. 兜底路由" },
  { id: "layout", label: "9. 布局与导航" },
  { id: "routes", label: "10. 路由表" },
  { id: "main", label: "11. 入口挂载" },
  { id: "build", label: "12. 生产构建" },
  { id: "run", label: "运行与验证" },
  { id: "next", label: "下一步" },
]

render(
  <Layout page="tutorial" mainClass="api-grid">
    <Toc items={TOC} />
    <div>
      <section id="overview" class="api-section">
        <h2>教程概览</h2>
        <p>
          这一篇从零开始，搭一个由 <strong>Bun</strong> 运行的单页应用（SPA）：用{" "}
          <a href="./dom.html">@kikojs/dom</a> 渲染真实 DOM，用{" "}
          <a href="./signal.html">@kikojs/signal</a> 管理状态，用{" "}
          <a href="./router.html">@kikojs/router</a> 做客户端路由。完成后有四个页面：
        </p>
        <ul style="color: var(--muted)">
          <li>
            <code>/</code> — 首页：可写 signal + <code>computed</code> 派生，演示细粒度更新。
          </li>
          <li>
            <code>/tasks</code> — 任务：模块级 signal 状态 + <code>Show</code> / <code>For</code>{" "}
            控制流。
          </li>
          <li>
            <code>/users/:id</code> — 用户详情：动态参数、查询参数与编程式导航。
          </li>
          <li>
            <code>*</code> — 404 兜底。
          </li>
        </ul>
        <p>最终的项目结构：</p>
        <Code
          code={`kiko-spa/
├── index.html          页面壳：<div id="app"> + module script
├── package.json        依赖与 dev / build 脚本
├── tsconfig.json       jsxImportSource: "@kikojs/dom"
├── server.ts           Bun.serve + HTML import（开发服务器）
├── bundler.ts          Bun.build 静态构建
└── src/
    ├── main.tsx        入口：render(<Router><App /></Router>)
    ├── app.tsx         外壳：导航 Link + Outlet + scoped <style>
    ├── routes.tsx      路由表 + createRouter
    ├── store.ts        模块级 signal 状态（任务列表）
    └── pages/
        ├── home.tsx
        ├── tasks.tsx
        ├── user.tsx
        └── not-found.tsx`}
          lang="text"
        />
        <div class="note">
          本页每个代码片段都是真实文件，随文档一起 typecheck；完整可运行版本在仓库的{" "}
          <code>examples/spa/</code>，与页面里的代码逐文件对应。想直接跑：
          <code>cd examples/spa &amp;&amp; bun run dev</code>。
        </div>
      </section>

      <section id="install" class="api-section">
        <h2>1. 安装依赖</h2>
        <p>
          新建目录并安装三个包——<code>bun add</code> 在没有 <code>package.json</code> 时会自动创建：
        </p>
        <Code
          code={`mkdir kiko-spa && cd kiko-spa
bun add @kikojs/dom @kikojs/signal @kikojs/router`}
          lang="shell"
        />
        <p>装好后补上运行脚本：</p>
        <CodeBlock src="./assets/snippets/tutorial/package.json" lang="json" />
        <table>
          <thead>
            <tr>
              <th>包</th>
              <th>职责</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>@kikojs/dom</code>
              </td>
              <td>
                JSX 工厂、<code>render</code>、<code>Show</code> / <code>For</code> /{" "}
                <code>Style</code>。自包含，不依赖其它 kiko 包。
              </td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/signal</code>
              </td>
              <td>
                <code>createSignal</code>、<code>computed</code>、<code>effect</code>、
                <code>batch</code>、<code>createStore</code> 等应用层状态工具。
              </td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/router</code>
              </td>
              <td>
                路由表、<code>Router</code> / <code>Link</code> / <code>Outlet</code>、hooks
                与守卫。
              </td>
            </tr>
          </tbody>
        </table>
        <div class="note">
          三者共享同一套标准信号：<code>@kikojs/dom</code> 的 JSX 直接消费{" "}
          <code>@kikojs/signal</code> 创建的 signal，不需要适配层。
        </div>
      </section>

      <section id="config" class="api-section">
        <h2>2. JSX 与 TS 配置</h2>
        <p>
          kiko 的 JSX 编译到 <code>@kikojs/dom</code> 的工厂函数。Bun 直接读取{" "}
          <code>tsconfig.json</code>，不需要额外的打包插件：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/tsconfig.json" lang="json" />
        <p>
          关键是 <code>jsx: "react-jsx"</code> 加 <code>jsxImportSource: "@kikojs/dom"</code>
          。也可以在每个文件顶部写 <code>/** @jsxImportSource @kikojs/dom */</code> 代替 tsconfig
          配置——本教程的片段都带这行注释，单独复制也能编译。
        </p>
      </section>

      <section id="server" class="api-section">
        <h2>3. Bun 开发服务器</h2>
        <p>
          先写页面壳。<code>index.html</code> 只做两件事：提供挂载点，引入入口 module：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/index.html" lang="html" />
        <p>
          服务器用 Bun 的 <strong>HTML imports</strong>：
          <code>import html from "./index.html"</code> 会让 Bun 在启动时转译 TSX、解析依赖并产出带
          hash 的资源路径；
          <code>routes</code> 里的 <code>"/*"</code> 让<strong>任意路径</strong>
          都回落同一份 HTML——这是 path 模式 SPA 的关键，深链接（如 <code>/users/42</code>
          ）直接刷新也能命中，而不是 404：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/server.ts" lang="ts" />
        <p>
          之后用 <code>bun run dev</code> 启动（<code>package.json</code> 里的脚本就是{" "}
          <code>bun run server.ts</code>）。此刻页面还是空白的——入口在 <a href="#main">第 11 步</a>
          接上。
        </p>
        <div class="note">
          HTML import 是 Bun 开发服务器/打包器的能力，浏览器里没有 <code>.html</code>{" "}
          模块。生产环境改用 <a href="#build">第 12 步</a> 的 <code>Bun.build</code> 输出静态文件。
        </div>
      </section>

      <section id="store" class="api-section">
        <h2>4. 共享状态 signal</h2>
        <p>
          状态放在<strong>模块级信号</strong>里：全局可见、默认响应式，不需要 Provider
          或上下文嵌套。kiko 没有 re-render 循环，组件函数只执行一次，所以
          {"“模块持有状态、JSX 持有绑定”"}就是最自然的写法：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/store.ts" lang="ts" />
        <p>
          <code>tasks</code> 是可写状态；<code>remaining</code> 是 <code>computed</code>{" "}
          派生，只在依赖的 <code>tasks</code> 变化时通知订阅者。读写都用标准接口：
          <code>tasks.get()</code> / <code>tasks.set(next)</code>。
        </p>
        <div class="note">
          这里用 <code>createSignal</code> 就够了。需要按属性路径做细粒度更新的深层对象时，改用{" "}
          <code>createStore</code>（见 <a href="./signal.html">signal API 参考</a>）。
        </div>
      </section>

      <section id="home" class="api-section">
        <h2>5. 首页：dom + signal</h2>
        <p>
          页面组件就是接收 props、返回节点的普通函数。signal 可以出现在 JSX
          的任何位置，运行时自动为每个绑定建立 watcher：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/pages/home.tsx" lang="tsx" />
        <p>
          点击按钮时只有显示数字的 <code>{"<span>"}</code> 与 <code>doubled</code>{" "}
          对应的文本节点更新——<code>HomePage</code> 函数不会重新执行，也没有任何 diff 开销。
        </p>
      </section>

      <section id="tasks" class="api-section">
        <h2>6. 任务页：控制流</h2>
        <p>
          kiko 没有模板指令，条件和列表通过组件表达，内部仍然只是信号加真实 DOM。
          <code>Show</code> 的 <code>when</code> 可以传
          signal：条件变化时整块分支替换，未选中的分支不执行；
          <code>For</code> 的 <code>each</code> 同样可以传 signal：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/pages/tasks.tsx" lang="tsx" />
        <p>
          输入框是受控的：<code>value={"{draft}"}</code> 把输入框的值绑到 signal，
          <code>onInput</code> 再把用户输入写回去；<code>{"{remaining}"}</code>{" "}
          直接消费派生信号，勾选后只更新这一处文本。
        </p>
        <div class="note">
          本例用的是 <code>For</code> 默认的<strong>条目身份</strong>
          模式：数据换成新对象时该行重建。数据有稳定 id、希望按 id 复用行（保留行内 DOM 状态）时传{" "}
          <code>getKey</code>，此时 children 的 <code>item</code> 变成访问器。详见{" "}
          <a href="./dom.html#for">dom API 参考 · For</a>。
        </div>
      </section>

      <section id="user" class="api-section">
        <h2>7. 动态参数与查询</h2>
        <p>
          <code>/users/:id</code> 的参数用 <code>useParams()</code> 读取，查询串用{" "}
          <code>useQuery()</code>。两者返回的都是<strong>响应式快照</strong>：放进{" "}
          <code>computed</code> 后，URL 变化只更新绑定的节点，组件函数不会重跑，也不需要 key
          强制重建：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/pages/user.tsx" lang="tsx" />
        <div class="note">
          组件内导航用 <code>useNavigate()</code> 拿到的函数；它返回 Promise，这里用{" "}
          <code>void</code> 显式忽略。守卫、重定向、嵌套路由与 keep-alive 见{" "}
          <a href="./router.html">router API 参考</a>。
        </div>
      </section>

      <section id="notfound" class="api-section">
        <h2>8. 兜底路由</h2>
        <p>
          没有任何路由匹配时渲染 404。组件里用 <code>Link</code> 做客户端跳转——
          它会拦截点击、走路由导航，同时保留 <code>href</code> 以便中键/新标签页/复制链接：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/pages/not-found.tsx" lang="tsx" />
      </section>

      <section id="layout" class="api-section">
        <h2>9. 布局与导航</h2>
        <p>
          外壳组件放导航和路由出口。<code>{"<Outlet />"}</code> 渲染当前匹配的路由组件；
          <code>{"<Link activeClass>"}</code> 在路径命中时自动加类名（分段感知，<code>exact</code>{" "}
          可要求全等）：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/app.tsx" lang="tsx" />
        <p>
          <code>{"<style>"}</code> 默认是 scoped 的：选择器被改写到最近的祖先元素（这里是{" "}
          <code>.app</code> 所在的 <code>{"<div>"}</code>，它会自动获得 <code>data-kiko-vN</code>{" "}
          属性），Show / For 动态插入的节点自动被覆盖，不需要模板编译器。加 <code>global</code>{" "}
          属性则跳过改写、直接全局注入。
        </p>
      </section>

      <section id="routes" class="api-section">
        <h2>10. 路由表</h2>
        <p>
          路由表是路径到组件的声明式映射。每个 <code>component</code> 接收{" "}
          <code>RouteComponentProps</code>（<code>params</code> / <code>query</code> /{" "}
          <code>location</code> / <code>router</code>），但通常直接读 hook 更直观：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/routes.tsx" lang="tsx" />
        <table>
          <thead>
            <tr>
              <th>路径</th>
              <th>组件</th>
              <th>演示</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>/</code>
              </td>
              <td>
                <code>HomePage</code>
              </td>
              <td>signal / computed 绑定</td>
            </tr>
            <tr>
              <td>
                <code>/tasks</code>
              </td>
              <td>
                <code>TasksPage</code>
              </td>
              <td>Show / For / 模块级状态</td>
            </tr>
            <tr>
              <td>
                <code>/users/:id</code>
              </td>
              <td>
                <code>UserPage</code>
              </td>
              <td>params / query / navigate</td>
            </tr>
            <tr>
              <td>
                <code>*</code>
              </td>
              <td>
                <code>NotFoundPage</code>
              </td>
              <td>兜底</td>
            </tr>
          </tbody>
        </table>
        <div class="note">
          <code>mode: "path"</code> 用 History API，需要服务端把未知路径回落到{" "}
          <code>index.html</code>（<a href="#server">第 3 步</a>的 <code>"/*"</code>{" "}
          路由已经处理）。纯静态托管无法配置回落时，改成 <code>mode: "hash"</code>，路由走{" "}
          <code>#/path</code>。
        </div>
      </section>

      <section id="main" class="api-section">
        <h2>11. 入口挂载</h2>
        <p>
          <code>Router</code> 提供路由上下文，布局里的 <code>Link</code> / <code>Outlet</code>{" "}
          都从它取 router；<code>render</code> 把整棵树挂到 <code>#app</code>，并返回{" "}
          <code>dispose()</code> 用于整体卸载（清理所有 watcher、事件监听与清理回调）：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/src/main.tsx" lang="tsx" />
        <p>
          至此 <code>bun run dev</code> 就能跑起来了。接下来只剩生产构建。
        </p>
      </section>

      <section id="build" class="api-section">
        <h2>12. 生产构建</h2>
        <p>
          开发服务器带 HMR 与按需转译，不适合直接上线。生产用 <code>Bun.build</code> 把{" "}
          <code>index.html</code> 及其引用打成静态文件：
        </p>
        <CodeBlock src="./assets/snippets/tutorial/bundler.ts" lang="ts" />
        <p>
          输出在 <code>dist/</code>，可直接交给 GitHub Pages / Nginx / CDN。path
          模式部署时记得让托管平台把未知路径回落到 <code>index.html</code>；做不到就用 hash 模式。
        </p>
      </section>

      <section id="run" class="api-section">
        <h2>运行与验证</h2>
        <Code
          code={`bun run dev                 # http://localhost:3000
bun run build               # 静态输出到 dist/`}
          lang="shell"
        />
        <p>打开 http://localhost:3000，逐项确认：</p>
        <table>
          <thead>
            <tr>
              <th>操作</th>
              <th>预期</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>点击导航</td>
              <td>不刷新页面，地址栏变化，当前链接高亮</td>
            </tr>
            <tr>
              <td>首页 +/−</td>
              <td>数字与其两倍同步更新</td>
            </tr>
            <tr>
              <td>任务页添加/勾选/删除</td>
              <td>列表最小化更新，剩余数量随之变化</td>
            </tr>
            <tr>
              <td>访问 /users/42?tab=posts</td>
              <td>显示「用户 42」「当前标签：posts」，按钮可切换 tab</td>
            </tr>
            <tr>
              <td>访问 /nope</td>
              <td>显示 404，可返回首页</td>
            </tr>
          </tbody>
        </table>
        <div class="note">
          仓库里的 <code>examples/spa/</code> 就是这个项目，可直接{" "}
          <code>cd examples/spa &amp;&amp; bun run dev</code>；它也会随{" "}
          <code>bun run typecheck</code> 一起做类型检查。
        </div>
      </section>

      <section id="next" class="api-section">
        <h2>下一步</h2>
        <ul style="color: var(--muted)">
          <li>
            <a href="./guide.html">指南</a> — 设计理念与完整上手：控制流、样式、生命周期。
          </li>
          <li>
            <a href="./dom.html">@kikojs/dom API 参考</a> — JSX、render、Show / For / Style、水合与
            SSR。
          </li>
          <li>
            <a href="./signal.html">@kikojs/signal API 参考</a> — effect、batch、createStore、
            createResource。
          </li>
          <li>
            <a href="./router.html">@kikojs/router API 参考</a> — 嵌套路由、守卫、重定向、
            keep-alive。
          </li>
          <li>
            <a href="./hmr.html">@kikojs/hmr API 参考</a> — 组件原位热替换与状态保留。
          </li>
          <li>
            <a href="./examples.html">示例页</a> — 可运行代码与实时 demo。
          </li>
        </ul>
      </section>
    </div>
  </Layout>,
  document.getElementById("root")!,
)
