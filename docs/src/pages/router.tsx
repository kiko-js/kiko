/**
 * @kikojs/router API 参考页（自静态 router.html 迁移，纯客户端渲染）。
 */
import { render } from "@kikojs/dom"
import { Layout, Toc } from "../shared"
import type { TocItem } from "../shared"
import { Code, CodeBlock } from "../code"

const TOC: TocItem[] = [
  { id: "overview", label: "概览" },
  { id: "install", label: "安装与导入" },
  { id: "createrouter", label: "createRouter" },
  {
    id: "components",
    label: "组件",
    children: [
      { id: "router", label: "Router" },
      { id: "link", label: "Link" },
      { id: "outlet", label: "Outlet" },
      { id: "navigate", label: "Navigate" },
    ],
  },
  { id: "hooks", label: "Hooks" },
  { id: "guards", label: "守卫" },
  { id: "history", label: "History" },
  { id: "utils", label: "工具函数" },
  { id: "types", label: "类型定义" },
  { id: "example", label: "完整示例" },
]

render(
  <Layout page="router" mainClass="api-grid">
    <Toc items={TOC} />

    <div>
      <section id="overview" class="api-section">
        <h2>概览</h2>
        <p>
          基于 signal 的声明式路由库。路由表（<code>RouteRecord[]</code>）+ 组件（Router / Link /
          Outlet）+ hooks 的模型，支持 path / hash
          模式、嵌套路由、动态参数、路由守卫、重定向与编程式导航，完全与{" "}
          <a href="./dom.html">@kikojs/dom</a> 和 <a href="./signal.html">@kikojs/signal</a> 集成。
        </p>
        <div class="note">
          路由状态（location / params / query 等）本身就是标准信号（<code>router.location</code>{" "}
          等），可以直接放进 JSX 或 <code>computed</code>。
        </div>
      </section>

      <section id="install" class="api-section">
        <h2>安装与导入</h2>
        <Code code={"bun add @kikojs/router"} lang="shell" />
        <CodeBlock src="./assets/snippets/router-install.ts" lang="ts" />
      </section>

      <section id="createrouter" class="api-section">
        <h2>createRouter</h2>
        <table>
          <thead>
            <tr>
              <th>签名</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>createRouter(options: RouterOptions): Router</code>
              </td>
              <td>创建路由器实例，管理路由状态、导航与守卫。</td>
            </tr>
          </tbody>
        </table>
        <h3>RouterOptions</h3>
        <table>
          <thead>
            <tr>
              <th>字段</th>
              <th>类型</th>
              <th>默认值</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>routes</code>
              </td>
              <td>
                <code>RouteRecord[]</code>
              </td>
              <td>—（必填）</td>
              <td>路由表，支持嵌套、动态参数、守卫与重定向。</td>
            </tr>
            <tr>
              <td>
                <code>mode</code>
              </td>
              <td>
                <code>{'"path" | "hash"'}</code>
              </td>
              <td>
                <code>{'"path"'}</code>
              </td>
              <td>路由模式，决定内部使用的 history adapter。</td>
            </tr>
            <tr>
              <td>
                <code>base</code>
              </td>
              <td>
                <code>string</code>
              </td>
              <td>
                <code>{'""'}</code>
              </td>
              <td>基本路径前缀（path 模式下生效）。</td>
            </tr>
            <tr>
              <td>
                <code>beforeEach</code>
              </td>
              <td>
                <code>RouteGuard | RouteGuard[]</code>
              </td>
              <td>—</td>
              <td>全局前置守卫。</td>
            </tr>
            <tr>
              <td>
                <code>afterEach</code>
              </td>
              <td>
                <code>{"((to, from) => void)[]"}</code>
              </td>
              <td>—</td>
              <td>全局后置钩子。</td>
            </tr>
          </tbody>
        </table>
        <h3>Router 实例</h3>
        <table>
          <thead>
            <tr>
              <th>成员</th>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>location / path / params / query / matched / currentRoute</code>
              </td>
              <td>signal</td>
              <td>
                路由状态（标准信号，可直接用于 JSX / computed）。其中 <code>path</code>{" "}
                只含路径部分：query/hash 变化不会触发依赖 <code>matched</code> / <code>params</code>{" "}
                / <code>currentRoute</code> 的订阅。
              </td>
            </tr>
            <tr>
              <td>
                <code>navigate / push / replace</code>
              </td>
              <td>方法</td>
              <td>编程式导航。</td>
            </tr>
            <tr>
              <td>
                <code>back / forward / go</code>
              </td>
              <td>方法</td>
              <td>历史前进后退。</td>
            </tr>
            <tr>
              <td>
                <code>beforeEach / afterEach</code>
              </td>
              <td>方法</td>
              <td>运行时注册守卫 / 钩子，返回取消函数。</td>
            </tr>
            <tr>
              <td>
                <code>dispose</code>
              </td>
              <td>方法</td>
              <td>清理监听器与状态。</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="components" class="api-section">
        <h2>组件</h2>

        <h3 id="router">Router</h3>
        <table>
          <thead>
            <tr>
              <th>Props</th>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>router</code>
              </td>
              <td>
                <code>Router</code>
              </td>
              <td>路由器实例。</td>
            </tr>
            <tr>
              <td>
                <code>children</code>
              </td>
              <td>
                <code>Node</code>
              </td>
              <td>子内容（通常包含 Link、Outlet）。</td>
            </tr>
          </tbody>
        </table>
        <p>
          建立当前路由上下文（供 hooks 与 Link 使用），卸载时调用 <code>router.dispose()</code>。
        </p>

        <h3 id="route">路由表</h3>
        <p>
          路由使用<strong>普通对象数组</strong>声明（<code>RouteRecord</code>），见
          <a href="#createrouter">RouterOptions.routes</a>。kiko 只提供配置式路由——
          路由表是纯数据，便于测试、代码分割与未来的自动化路由（如文件路由）生成。
        </p>

        <h3 id="link">Link</h3>
        <table>
          <thead>
            <tr>
              <th>Props</th>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>to</code>
              </td>
              <td>
                <code>string</code>
              </td>
              <td>目标路径。</td>
            </tr>
            <tr>
              <td>
                <code>replace</code>
              </td>
              <td>
                <code>boolean</code>
              </td>
              <td>替换当前历史记录（默认 false）。</td>
            </tr>
            <tr>
              <td>
                <code>state</code>
              </td>
              <td>
                <code>unknown</code>
              </td>
              <td>附加导航状态。</td>
            </tr>
            <tr>
              <td>
                <code>activeClass</code>
              </td>
              <td>
                <code>string</code>
              </td>
              <td>当前路径匹配时添加的 class。</td>
            </tr>
            <tr>
              <td>
                <code>exact</code>
              </td>
              <td>
                <code>boolean</code>
              </td>
              <td>精确匹配时才添加 activeClass（默认前缀匹配）。</td>
            </tr>
            <tr>
              <td>
                <code>children</code>
              </td>
              <td>
                <code>Node</code>
              </td>
              <td>链接内容。</td>
            </tr>
          </tbody>
        </table>
        <p>
          渲染为 <code>{"<a>"}</code>；点击时在 router 上执行导航（<code>ctrl/meta/shift</code>{" "}
          键或非主键点击、<code>target</code> 为外链时不拦截）。
        </p>

        <h3 id="outlet">Outlet</h3>
        <table>
          <thead>
            <tr>
              <th>Props</th>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>router</code>
              </td>
              <td>
                <code>Router</code>
              </td>
              <td>指定路由器（可选，默认使用最近的 Router）。</td>
            </tr>
            <tr>
              <td>
                <code>keepAlive</code>
              </td>
              <td>
                <code>{"boolean | { max? }"}</code>
              </td>
              <td>
                离屏保留：切走时只 detach、不清理子树，组件不重跑、状态不丢失，再次进入原样恢复。{" "}
                <code>max</code> 为 LRU 上限（默认 10）。路由表里 <code>RouteRecord.keepAlive</code>{" "}
                或后代路由标记了 keepAlive 时自动生效，这里可覆盖/关闭。
              </td>
            </tr>
            <tr>
              <td>
                <code>keyBy</code>
              </td>
              <td>
                <code>{"(entry, router) => unknown"}</code>
              </td>
              <td>
                自定义实例键。默认只按路由身份（<code>route.path</code>）缓存——query/hash/params
                都是组件内部通过 hook 响应式消费的数据，变化不重建组件；需要按参数/URL 区分实例时
                返回稳定值即可。
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          渲染当前匹配路由的组件，用于嵌套布局。组件函数在同一个路由身份下
          <strong>只执行一次</strong>
          ：query / hash / 本层 params 变化不会重跑组件，而是由 <code>useParams()</code> /{" "}
          <code>useQuery()</code> / <code>router.path</code>{" "}
          等信号驱动页面数据更新（分页、筛选等）。切到其他路由时，默认清理旧子树；开启{" "}
          <code>keepAlive</code> 后离屏保留，回来时原状态恢复。
        </p>
        <div class="note">
          路由组件里请用 hooks 的响应式访问器（放进 <code>computed</code> / effect / signal
          绑定），不要依赖一次性 props 快照——props.params / props.query 只在首次渲染时定格。
        </div>
        <CodeBlock src="./assets/snippets/router-keepalive.tsx" lang="tsx" />

        <h3 id="navigate">Navigate</h3>
        <table>
          <thead>
            <tr>
              <th>Props</th>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>to</code>
              </td>
              <td>
                <code>string</code>
              </td>
              <td>跳转目标。</td>
            </tr>
            <tr>
              <td>
                <code>replace</code>
              </td>
              <td>
                <code>boolean</code>
              </td>
              <td>替换当前历史记录（默认 true）。</td>
            </tr>
          </tbody>
        </table>
        <p>渲染时立即执行导航，不渲染任何 DOM。</p>
      </section>

      <section id="hooks" class="api-section">
        <h2>Hooks</h2>
        <table>
          <thead>
            <tr>
              <th>Hook</th>
              <th>返回</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>useRouter()</code>
              </td>
              <td>
                <code>Router</code>
              </td>
              <td>获取当前 router 实例（Router 外调用抛错）。</td>
            </tr>
            <tr>
              <td>
                <code>useParams()</code>
              </td>
              <td>
                <code>RouteParams</code>
              </td>
              <td>当前动态路由参数快照。</td>
            </tr>
            <tr>
              <td>
                <code>useQuery()</code>
              </td>
              <td>
                <code>RouteQuery</code>
              </td>
              <td>当前查询参数快照。</td>
            </tr>
            <tr>
              <td>
                <code>useLocation()</code>
              </td>
              <td>
                <code>RouteLocation</code>
              </td>
              <td>当前 location 快照。</td>
            </tr>
            <tr>
              <td>
                <code>useRoute()</code>
              </td>
              <td>
                <code>{"{ route, matched, params, query, location }"}</code>
              </td>
              <td>完整路由上下文快照。</td>
            </tr>
            <tr>
              <td>
                <code>tryUseRouter()</code>
              </td>
              <td>
                <code>{"Router | null"}</code>
              </td>
              <td>安全获取 router，Router 外返回 null。</td>
            </tr>
            <tr>
              <td>
                <code>useNavigate()</code>
              </td>
              <td>
                <code>{"(to, options?) => Promise<void>"}</code>
              </td>
              <td>获取绑定当前 router 的导航函数（Router 内调用）。</td>
            </tr>
          </tbody>
        </table>
        <p class="note">
          hooks 返回<strong>响应式访问器</strong>（可直接调用 <code>()</code>、读{" "}
          <code>.get()</code> 或访问字段，如 <code>useParams().id</code>）。同一路由身份下组件函数
          只执行一次，query/hash/参数变化不重跑组件——需要响应式消费时把 hook 放进{" "}
          <code>computed</code> / effect / signal 绑定；也可以直接用 <code>router.location</code> /{" "}
          <code>router.params</code> 等信号。
        </p>
        <CodeBlock src="./assets/snippets/router-hooks.tsx" lang="tsx" />
      </section>

      <section id="guards" class="api-section">
        <h2>守卫</h2>
        <p>
          守卫通过 <code>beforeEach</code>（全局）或{" "}
          <code>RouteRecord.beforeEnter / beforeLeave</code>
          （路由级）注册。守卫返回 <code>true</code>（放行）、<code>false</code>（阻止）、
          <code>string</code>（重定向路径）或 <code>RedirectDescriptor</code>；支持异步（
          <code>Promise</code>）。
        </p>
        <table>
          <thead>
            <tr>
              <th>导出</th>
              <th>签名</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>createAuthGuard</code>
              </td>
              <td>
                <code>createAuthGuard(predicate, redirectTo): RouteGuard</code>
              </td>
              <td>认证守卫：predicate 返回 falsy 时重定向。</td>
            </tr>
            <tr>
              <td>
                <code>combineGuards</code>
              </td>
              <td>
                <code>combineGuards(...guards): RouteGuard</code>
              </td>
              <td>组合多个守卫，按顺序执行，遇到第一个拦截结果立即返回。</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/router-guards.tsx" lang="tsx" />
      </section>

      <section id="history" class="api-section">
        <h2>History</h2>
        <p>
          <code>createRouter</code> 按 <code>mode</code> 自动选择 adapter：path 模式用{" "}
          <code>createPathHistory</code>（History API），hash 模式用 <code>createHashHistory</code>
          （hashchange）。两个工厂也可单独创建，用于测试或非浏览器环境。
        </p>
        <table>
          <thead>
            <tr>
              <th>导出</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>createPathHistory(base?)</code>
              </td>
              <td>基于 History API 的 path 模式 adapter。</td>
            </tr>
            <tr>
              <td>
                <code>createHashHistory()</code>
              </td>
              <td>基于 hashchange 的 hash 模式 adapter。</td>
            </tr>
          </tbody>
        </table>
        <p>
          adapter 接口：<code>getPath / getHash / push / replace / go / listen / dispose</code>。
          两种 adapter 的方法语义完全一致，只有实现不同（path 模式基于 <code>popstate</code> +{" "}
          History API，hash 模式基于 <code>hashchange</code>）：<code>getPath()</code> 返回路径 +
          query（不含 base、不含 <code>#</code> 片段），<code>getHash()</code> 返回 <code>#</code>{" "}
          片段（无片段为空字符串）。
        </p>
        <CodeBlock src="./assets/snippets/router-history.ts" lang="ts" />
      </section>

      <section id="utils" class="api-section">
        <h2>工具函数</h2>
        <table>
          <thead>
            <tr>
              <th>导出</th>
              <th>签名</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>redirect</code>
              </td>
              <td>
                <code>redirect(path, state?): RedirectDescriptor</code>
              </td>
              <td>创建重定向描述（push）。</td>
            </tr>
            <tr>
              <td>
                <code>redirectReplace</code>
              </td>
              <td>
                <code>redirectReplace(path, state?): RedirectDescriptor</code>
              </td>
              <td>创建重定向描述（replace）。</td>
            </tr>
            <tr>
              <td>
                <code>buildPath</code>
              </td>
              <td>
                <code>buildPath(path, query?): string</code>
              </td>
              <td>构建带查询字符串的路径。</td>
            </tr>
            <tr>
              <td>
                <code>getQueryValue</code>
              </td>
              <td>
                <code>{"getQueryValue(query, key): string | undefined"}</code>
              </td>
              <td>从 query 对象提取单值（数组取首项）。</td>
            </tr>
            <tr>
              <td>
                <code>pathsEqual</code>
              </td>
              <td>
                <code>pathsEqual(a, b): boolean</code>
              </td>
              <td>比较路径是否匹配（忽略查询串、hash 与尾部斜杠）。</td>
            </tr>
            <tr>
              <td>
                <code>navigateFrom</code>
              </td>
              <td>
                <code>{"navigateFrom(router): (to, options?) => void"}</code>
              </td>
              <td>
                把 router 绑定为导航函数（组件内请用 <code>useNavigate()</code> hook）。
              </td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/router-utils.ts" lang="ts" />
      </section>

      <section id="types" class="api-section">
        <h2>类型定义</h2>
        <table>
          <thead>
            <tr>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>RouteParams</code>
              </td>
              <td>
                <code>{"Record<string, string>"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteQuery</code>
              </td>
              <td>
                <code>{"Record<string, string | string[]>"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteMode</code>
              </td>
              <td>
                <code>{'"path" | "hash"'}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteLocation</code>
              </td>
              <td>
                <code>{"{ path, hash, query, fullPath, state, key }"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>NavigateOptions</code>
              </td>
              <td>
                <code>{"{ replace?, state? }"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteRecord</code>
              </td>
              <td>
                路由配置记录：
                <code>
                  {
                    "{ path, component?, keepAlive?, children?, meta?, beforeEnter?, beforeLeave?, redirect? }"
                  }
                </code>
              </td>
            </tr>
            <tr>
              <td>
                <code>KeepAlive / KeepAliveOptions</code>
              </td>
              <td>
                <code>{"boolean | { max? }"}</code>——离屏保留开关与 LRU 上限（默认 10）。
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteComponentProps</code>
              </td>
              <td>
                路由组件 props：<code>{"{ params, query, location, router }"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteGuardResult</code>
              </td>
              <td>
                <code>{"boolean | string | RedirectDescriptor | undefined"}</code>（可 Promise）
              </td>
            </tr>
            <tr>
              <td>
                <code>RedirectDescriptor</code>
              </td>
              <td>
                <code>{"{ path, replace?, state? }"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteGuard</code>
              </td>
              <td>
                <code>{"(to, from, router) => RouteGuardResult"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>RouteMatch</code>
              </td>
              <td>
                匹配结果：<code>{"{ route, params, remaining }"}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>Router</code>
              </td>
              <td>
                路由器实例接口（见 <a href="#createrouter">createRouter</a>）。
              </td>
            </tr>
            <tr>
              <td>
                <code>RouterOptions</code>
              </td>
              <td>
                <code>{"{ mode?, base?, routes, beforeEach?, afterEach? }"}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="example" class="api-section">
        <h2>完整示例</h2>
        <CodeBlock src="./assets/snippets/router-basic.tsx" lang="tsx" />
      </section>
    </div>
  </Layout>,
  document.getElementById("root")!,
)
