/**
 * @kikojs/hmr API 参考页：独立 HMR 端点、通用核心与 Bun / Node 接入。
 */
import { render } from "@kikojs/dom"
import { Layout, Toc } from "../shared"
import type { TocItem } from "../shared"
import { CodeBlock } from "../code"

const TOC: TocItem[] = [
  { id: "overview", label: "概览" },
  { id: "install", label: "安装与入口" },
  { id: "endpoint", label: "独立端点（/hmr）" },
  { id: "hub", label: "createHmrHub" },
  { id: "bun", label: "Bun 接入" },
  { id: "node", label: "Node 接入" },
  { id: "client", label: "客户端" },
  { id: "protocol", label: "协议" },
  { id: "transform", label: "模块改写" },
  { id: "state", label: "状态保留" },
  { id: "example", label: "完整示例" },
]

render(
  <Layout page="hmr" mainClass="api-grid">
    <Toc items={TOC} />

    <div>
      <section id="overview" class="api-section">
        <h2>概览</h2>
        <p>
          <code>@kikojs/hmr</code> 提供 React Fast Refresh 语义的热替换运行时，并把 HMR
          的通信层抽成一个<strong>独立端点</strong>：客户端连到 <code>/hmr</code>（路径可配置），
          通过 <strong>SSE 或 WebSocket</strong> 接收更新。
        </p>
        <ul style="color: var(--muted)">
          <li>
            <strong>框架无关：</strong>核心 Hub 只依赖 Fetch API（
            <code>Request</code> / <code>Response</code> / <code>ReadableStream</code>），Bun / Deno
            / Cloudflare Workers / Node 18+ 都能直接接入；更新事件由宿主
            <code>publish()</code> 推入。
          </li>
          <li>
            <strong>路径无关：</strong>
            <code>hub.handle(request)</code> 处理交给它的任意请求， 不解析 URL 路由；挂在{" "}
            <code>/hmr</code> 还是别的路径由适配器决定。模块 id 也是不透明字符串，不要求是文件路径。
          </li>
          <li>
            <strong>传输可切换：</strong>浏览器客户端默认走 SSE（纯 Fetch API，跨代理最稳）， 也可选{" "}
            <code>ws</code>，或 <code>auto</code> 先试 WebSocket 再回落 SSE。
          </li>
          <li>
            <strong>状态保留：</strong>组件原位热替换，组件内部信号按创建序恢复旧值，
            模块级信号直接复用旧信号对象——状态不丢。
          </li>
        </ul>
        <div class="note">
          架构：<strong>通用代码</strong>（<code>@kikojs/hmr</code>：协议 / Hub / 客户端 / 注册表；
          <code>@kikojs/hmr/transform</code>：模块改写；<code>@kikojs/hmr/watcher</code>：文件监听）
          + <strong>接入方式</strong>（<code>@kikojs/hmr/bun</code>、<code>@kikojs/hmr/node</code>
          ）。 根入口保持浏览器 / SSR 安全，不引入 <code>oxc-parser</code> / <code>node:fs</code>。
        </div>
      </section>

      <section id="install" class="api-section">
        <h2>安装与入口</h2>
        <p>通用代码与接入入口分开导出：</p>
        <CodeBlock src="./assets/snippets/hmr-install.sh" lang="shell" />
        <table>
          <thead>
            <tr>
              <th>入口</th>
              <th>内容</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>@kikojs/hmr</code>
              </td>
              <td>
                通用核心：协议、服务端 Hub（<code>createHmrHub</code>）、客户端（
                <code>connectHmr</code> / <code>ensureHmrClient</code>）与注册表运行时。浏览器 / SSR
                安全。
              </td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/hmr/client</code>
              </td>
              <td>浏览器侧入口（客户端 + 注册表应用层），插件注入的胶水使用它。</td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/hmr/server</code>
              </td>
              <td>仅服务端 Hub / 协议（不含浏览器客户端）。</td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/hmr/transform</code>
              </td>
              <td>
                通用模块改写（<code>transformForHmr</code>，依赖 <code>oxc-parser</code>）。
              </td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/hmr/watcher</code>
              </td>
              <td>
                通用递归文件监听（<code>createPathWatcher</code> / <code>toModuleId</code>）。
              </td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/hmr/bun</code>
              </td>
              <td>
                Bun 接入：打包插件（<code>kikoHmr</code>）+ <code>createBunHmr</code>（fetch /
                websocket）。
              </td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/hmr/node</code>
              </td>
              <td>
                Node 接入：<code>createNodeHmr</code>、<code>toNodeListener</code>（
                <code>node:http</code>）、<code>bindSocket</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>@kikojs/dom/hmr</code>
              </td>
              <td>
                DOM 宿主接线层（注入 <code>HmrDomAdapters</code> 并安装全局注册表）。
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="endpoint" class="api-section">
        <h2>独立端点（/hmr）</h2>
        <p>
          端点是一个普通的 HTTP 路由，默认路径 <code>/hmr</code>：
        </p>
        <table>
          <thead>
            <tr>
              <th>请求</th>
              <th>行为</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>GET /hmr</code>
              </td>
              <td>
                <code>text/event-stream</code>（SSE）。建立后立刻发送
                <code>connected</code>，之后推送 <code>update</code> / <code>reload</code> /{" "}
                <code>ping</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /hmr</code> + <code>Upgrade: websocket</code>
              </td>
              <td>升级为 WebSocket，收发同一套 JSON 消息。</td>
            </tr>
            <tr>
              <td>
                <code>POST /hmr</code>
              </td>
              <td>
                客户端 → 服务端消息（如 <code>hello</code>）；SSE 是单向通道，客户端消息走 POST。
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          <code>
            createBunHmr({"{"} path: "/__hmr" {"}"})
          </code>{" "}
          之类可以改路径；核心
          <code>HmrHub</code> 始终不认识路径，只处理交给它的请求。
        </p>
      </section>

      <section id="hub" class="api-section">
        <h2>createHmrHub</h2>
        <p>
          服务端连接池 + 广播中心。任何 Fetch API 宿主都可直接用它实现
          <code>/hmr</code>；WebSocket 等长连接把 socket 包成 <code>HmrSink</code> 接入同一广播。
        </p>
        <CodeBlock src="./assets/snippets/hmr-hub.ts" lang="ts" />
        <table>
          <thead>
            <tr>
              <th>成员</th>
              <th>签名</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>handle</code>
              </td>
              <td>
                <code>{"(request: Request) => Promise<Response>"}</code>
              </td>
              <td>获取端点响应：GET → SSE 流，POST → 接收客户端消息。</td>
            </tr>
            <tr>
              <td>
                <code>publish</code>
              </td>
              <td>
                <code>{"(modules: string | string[]) => void"}</code>
              </td>
              <td>广播模块更新。</td>
            </tr>
            <tr>
              <td>
                <code>reload</code>
              </td>
              <td>
                <code>{"(reason?: string) => void"}</code>
              </td>
              <td>广播整页重载。</td>
            </tr>
            <tr>
              <td>
                <code>subscribe</code>
              </td>
              <td>
                <code>{"(sink: HmrSink) => () => void"}</code>
              </td>
              <td>接入长连接，返回退订函数。</td>
            </tr>
            <tr>
              <td>
                <code>receive</code>
              </td>
              <td>
                <code>{"(data: string, sink?) => void"}</code>
              </td>
              <td>处理 WebSocket 等传输上收到的原始消息。</td>
            </tr>
            <tr>
              <td>
                <code>close</code>
              </td>
              <td>
                <code>{"() => void"}</code>
              </td>
              <td>关闭所有连接并停止心跳。</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="bun" class="api-section">
        <h2>Bun 接入</h2>
        <p>
          在 <code>bunfig.toml</code> 启用打包插件（把顶层组件改写为注册表包装并注入端点胶水）：
        </p>
        <CodeBlock src="./assets/snippets/hmr-bunfig.toml" lang="toml" />
        <p>
          然后给 <code>Bun.serve</code> 接入 fetch / websocket 入口。<code>createBunHmr</code>{" "}
          返回的 <code>fetch</code> 只处理本端点，其它请求返回 <code>undefined</code> 交回宿主。
        </p>
        <CodeBlock src="./assets/snippets/hmr-server.ts" lang="ts" />
        <table>
          <thead>
            <tr>
              <th>选项</th>
              <th>默认值</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>path</code>
              </td>
              <td>
                <code>{'"/hmr"'}</code>
              </td>
              <td>端点路径。</td>
            </tr>
            <tr>
              <td>
                <code>watch</code>
              </td>
              <td>
                <code>false</code>
              </td>
              <td>
                <code>true</code> / 目录 / 目录数组：用 <code>fs.watch</code>（recursive）监听变化并
                自动 <code>publish()</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>include</code>
              </td>
              <td>
                <code>{"/\\.(tsx|jsx|ts)$/"}</code>
              </td>
              <td>参与 HMR 的文件。</td>
            </tr>
            <tr>
              <td>
                <code>cwd</code>
              </td>
              <td>
                <code>process.cwd()</code>
              </td>
              <td>模块 id 规范化基准，与打包插件一致。</td>
            </tr>
            <tr>
              <td>
                <code>hub</code>
              </td>
              <td>新建</td>
              <td>复用已有 Hub。</td>
            </tr>
            <tr>
              <td>
                <code>heartbeatMs</code>
              </td>
              <td>
                <code>15000</code>
              </td>
              <td>
                心跳间隔，<code>0</code> 关闭。
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="node" class="api-section">
        <h2>Node 接入</h2>
        <p>
          Node 没有内置 bundler，也不提供 <code>import.meta.hot</code>：<code>createNodeHmr</code>{" "}
          提供纯 Fetch API 的 <code>fetch</code>，用 <code>toNodeListener</code> 桥接{" "}
          <code>node:http</code>（响应体流式写回，SSE 实时）， 用 <code>bindSocket</code> 把{" "}
          <code>ws</code> 等 EventEmitter 风格 WebSocket 接进同一 Hub。改写后的模块由端点驱动（
          <code>managed: false</code>）按模块 URL 重新导入。
        </p>
        <CodeBlock src="./assets/snippets/hmr-node.ts" lang="ts" />
        <table>
          <thead>
            <tr>
              <th>成员</th>
              <th>签名</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>fetch</code>
              </td>
              <td>
                <code>{"(request: Request) => Response | Promise<Response> | undefined"}</code>
              </td>
              <td>非本端点返回 undefined，可交给上层框架。</td>
            </tr>
            <tr>
              <td>
                <code>toNodeListener</code>
              </td>
              <td>
                <code>{"(hmr, options?) => (req, res) => void"}</code>
              </td>
              <td>
                <code>node:http</code> 适配器；<code>options.fallback</code> 处理未命中请求。
              </td>
            </tr>
            <tr>
              <td>
                <code>bindSocket</code>
              </td>
              <td>
                <code>{"(socket) => () => void"}</code>
              </td>
              <td>把 WebSocket 接进 Hub，返回解绑函数。</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="client" class="api-section">
        <h2>客户端</h2>
        <p>
          插件注入的胶水会自动 <code>ensureHmrClient()</code> 连接端点；也可以手动使用{" "}
          <code>connectHmr</code>。宿主可以在模块脚本之前设置 <code>globalThis.__KIKO_HMR__</code>{" "}
          配置端点与传输：
        </p>
        <CodeBlock src="./assets/snippets/hmr-client.ts" lang="ts" />
        <div class="note">
          模块胶水仅在没有 bundler HMR（<code>import.meta.hot</code>）时才按{" "}
          <code>import.meta.url</code> 重新导入模块；Bun 自带 HMR 时由 accept
          回调负责替换，端点只负责通知。需要宿主自行加载模块时，传 <code>loadModule</code>{" "}
          覆盖默认的 <code>import()</code>。
        </div>
      </section>

      <section id="protocol" class="api-section">
        <h2>协议</h2>
        <p>
          所有消息都是一个带 <code>type</code> 字段的 JSON 对象：
        </p>
        <table>
          <thead>
            <tr>
              <th>方向</th>
              <th>消息</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>服务端 → 客户端</td>
              <td>
                <code>{'{"type":"connected","version":1}'}</code>
              </td>
              <td>连接建立。</td>
            </tr>
            <tr>
              <td>服务端 → 客户端</td>
              <td>
                <code>{'{"type":"update","modules":["src/app.tsx"]}'}</code>
              </td>
              <td>模块变化。</td>
            </tr>
            <tr>
              <td>服务端 → 客户端</td>
              <td>
                <code>{'{"type":"reload","reason":"..."}'}</code>
              </td>
              <td>整页重载。</td>
            </tr>
            <tr>
              <td>服务端 → 客户端</td>
              <td>
                <code>{'{"type":"ping"}'}</code>
              </td>
              <td>心跳。</td>
            </tr>
            <tr>
              <td>客户端 → 服务端</td>
              <td>
                <code>{'{"type":"hello","version":1}'}</code> / <code>{'{"type":"pong"}'}</code>
              </td>
              <td>握手 / 心跳应答。</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="transform" class="api-section">
        <h2>模块改写</h2>
        <p>
          通用改写器 <code>transformForHmr()</code> 基于 <code>oxc-parser</code> 的 AST span
          做文本拼接（不重排格式）；接入方式决定是否注入 bundler 粘合（
          <code>bundler: "bun" | false</code>）：
        </p>
        <ul style="color: var(--muted)">
          <li>
            顶层 PascalCase 组件（函数声明 / <code>const</code> 箭头与函数表达式 / 默认导出）
            改名后注册为 <code>__kiko_hmr.ref(moduleId, name, impl)</code>
            ，引用在调用期解析到稳定包装。
          </li>
          <li>
            注入 <code>beginModule</code> / <code>endModule</code>（模块级信号身份作用域）与{" "}
            <code>
              acceptHmrModule(moduleId, {"{"} url, managed {"}"})
            </code>
            （端点登记）。
          </li>
          <li>
            <code>bundler: "bun"</code> 时组件模块再注入 <code>import.meta.hot.accept</code>{" "}
            自接受粘合；
            <code>false</code>（Node 等无 bundler HMR 的接入）不注入，由端点驱动。
            非组件模块只登记端点，不成为 accept 边界（否则更新停止冒泡）。
          </li>
          <li>
            <code>moduleId</code> 由接入层规范化（<code>relative(cwd, file)</code>，正斜杠）；
            核心只把它当不透明字符串。
          </li>
        </ul>
      </section>

      <section id="state" class="api-section">
        <h2>状态保留</h2>
        <ul style="color: var(--muted)">
          <li>
            <strong>组件内部信号：</strong>实例记录本次渲染创建的信号（按创建序 + 类型指纹），
            重跑时恢复旧值；类型变化则重置。
          </li>
          <li>
            <strong>模块级信号：</strong>按「模块 + 创建序」复用旧信号对象，身份与值都保留。
          </li>
          <li>
            <strong>嵌套组件：</strong>更新批次内父级 remount 会按创建序认领同 key 的现成实例，
            子组件状态不丢。
          </li>
          <li>
            <strong>组件删除：</strong>本轮模块求值未重新注册的组件会被卸载并清理 watcher。
          </li>
        </ul>
      </section>

      <section id="example" class="api-section">
        <h2>完整示例</h2>
        <p>
          仓库内 <code>examples/hmr</code> 是可直接运行的演示（<code>bun run dev</code>， 默认{" "}
          <code>http://localhost:3003</code>）：编辑 <code>src/counter.tsx</code>{" "}
          组件热替换且计数保留；编辑 <code>src/store.ts</code> 模块信号身份保留；编辑{" "}
          <code>src/client.tsx</code> 入口重渲染并认领实例。服务端同时暴露 <code>/hmr</code> 端点（
          <code>createBunHmr({"{ watch: ['src'] }"})</code>）。
        </p>
        <CodeBlock src="./assets/snippets/hmr-server.ts" lang="ts" />
        <p>Node 接入同一套协议与运行时：</p>
        <CodeBlock src="./assets/snippets/hmr-node.ts" lang="ts" />
      </section>
    </div>
  </Layout>,
  document.getElementById("root")!,
)
