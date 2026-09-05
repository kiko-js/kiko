import { render } from "@kikojs/dom"
import { Layout, Toc } from "../shared"
import type { TocItem } from "../shared"
import { Code, CodeBlock } from "../code"

const TOC: TocItem[] = [
  { id: "overview", label: "概览" },
  { id: "install", label: "安装与导入" },
  {
    id: "basic",
    label: "基础",
    children: [
      { id: "createsignal", label: "createSignal" },
      { id: "issignal", label: "isSignal" },
    ],
  },
  {
    id: "derive",
    label: "派生计算",
    children: [
      { id: "computed", label: "computed / derived" },
      { id: "watch", label: "toSignalValue / watchValue" },
    ],
  },
  {
    id: "effects",
    label: "副作用",
    children: [
      { id: "effect", label: "effect" },
      { id: "oncleanup", label: "onCleanup" },
      { id: "batch", label: "batch" },
      { id: "untrack", label: "untrack" },
      { id: "on", label: "on" },
    ],
  },
  { id: "state", label: "状态管理 — createStore" },
  { id: "resource", label: "异步数据 — createResource" },
  {
    id: "lowlevel",
    label: "事件与底层",
    children: [
      { id: "emitter", label: "createEmitter" },
      { id: "watcher", label: "createWatcher" },
    ],
  },
  { id: "example", label: "完整示例" },
]

const ulStyle = "color: var(--muted); margin-bottom: 22px"

render(
  <Layout page="signal" mainClass="api-grid">
    <Toc items={TOC} />
    <div>
      <section id="overview" class="api-section">
        <h2>概览</h2>
        <p>
          基于
          <a
            href="https://github.com/nicolo-ribaudo/signal-polyfill"
            target="_blank"
            rel="noopener"
          >
            signal-polyfill
          </a>
          的信号工具集。所有 API 返回标准 <code>Signal.State</code> /<code>Signal.Computed</code>{" "}
          对象，与 TC39 Signals 提案兼容，任何消费标准信号的库均可互操作。
        </p>
        <div class="note">
          <strong>适用场景：</strong>应用层状态管理、派生计算、副作用协调。
          <br />
          如需 JSX / DOM 渲染，请使用 <a href="./dom.html">@kikojs/dom</a>；组合使用见
          <a href="./guide.html">指南</a>。
        </div>
      </section>

      <section id="install" class="api-section">
        <h2>安装与导入</h2>
        <Code code="bun add @kikojs/signal" lang="shell" />
        <CodeBlock src="./assets/snippets/signal-install.ts" lang="ts" />
      </section>

      <section id="basic" class="api-section">
        <h2>基础</h2>

        <h3 id="createsignal">createSignal</h3>
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
                <code>createSignal&lt;T&gt;(initial: T): Signal.State&lt;T&gt;</code>
              </td>
              <td>
                创建可写信号，<code>.get()</code> 读取、<code>.set(v)</code> 写入。
              </td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/signal-basic.ts" lang="ts" />

        <h3 id="issignal">isSignal</h3>
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
                <code>isSignal(value): value is Signal.State | Signal.Computed</code>
              </td>
              <td>类型守卫，判断值是否为 signal（State 或 Computed）。</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="derive" class="api-section">
        <h2>派生计算</h2>

        <h3 id="computed">computed / derived</h3>
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
                <code>computed</code>
              </td>
              <td>
                <code>computed&lt;T&gt;(fn: () =&gt; T): Signal.Computed&lt;T&gt;</code>
              </td>
              <td>创建只读派生信号，自动追踪依赖；依赖变化时按需重算。</td>
            </tr>
            <tr>
              <td>
                <code>derived</code>
              </td>
              <td>
                <code>derived&lt;T&gt;(fn: () =&gt; T): Signal.Computed&lt;T&gt;</code>
              </td>
              <td>
                已弃用：<code>computed</code> 的别名。请直接使用 <code>computed</code>。
              </td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/signal-computed.ts" lang="ts" />

        <h3 id="watch">toSignalValue / watchValue</h3>
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
                <code>toSignalValue</code>
              </td>
              <td>
                <code>toSignalValue&lt;T&gt;(value | signal): T</code>
              </td>
              <td>读取 signal 当前值；普通值直接返回（不订阅）。</td>
            </tr>
            <tr>
              <td>
                <code>watchValue</code>
              </td>
              <td>
                <code>watchValue(value | signal, cb): Watcher | null</code>
              </td>
              <td>
                监听变化并自动追踪；对普通值立即回调一次并返回 <code>null</code>。
              </td>
            </tr>
          </tbody>
        </table>
        <p class="note">
          <code>watchValue</code> 对 signal 只在<strong>变化后</strong>回调（不立即执行）；返回值
          是标准 <code>Signal.subtle.Watcher</code>，由调用方负责 <code>unwatch</code> 管理。
        </p>
        <CodeBlock src="./assets/snippets/signal-watch.ts" lang="ts" />
      </section>

      <section id="effects" class="api-section">
        <h2>副作用</h2>

        <h3 id="effect">effect</h3>
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
                <code>effect(fn: () =&gt; void | (() =&gt; void)): () =&gt; void</code>
              </td>
              <td>
                创建副作用，自动追踪 signal 依赖并在变化后重新运行。 返回
                <code>dispose()</code> 用于手动停止。
              </td>
            </tr>
          </tbody>
        </table>
        <p>核心特性：</p>
        <ul style={ulStyle}>
          <li>
            <strong>批处理：</strong>多次 signal 写入合并为一次微任务刷新。
          </li>
          <li>
            <strong>错误隔离：</strong>单个 effect 抛出异常不影响其他 effect 或后续重跑。
          </li>
          <li>
            <strong>清理作用域：</strong>支持 <code>onCleanup</code>
            注册清理回调，重跑前逆序执行。
          </li>
        </ul>
        <CodeBlock src="./assets/snippets/signal-effect.ts" lang="ts" />

        <h3 id="oncleanup">onCleanup</h3>
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
                <code>onCleanup(fn: () =&gt; void): void</code>
              </td>
              <td>在当前 effect 作用域注册清理函数。重跑前逆序执行，dispose 时也执行。</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/signal-cleanup.ts" lang="ts" />

        <h3 id="batch">batch</h3>
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
                <code>batch&lt;T&gt;(fn: () =&gt; T): T</code>
              </td>
              <td>合并 fn 内所有 signal 写入，统一在结束时刷新一次。</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/signal-batch.ts" lang="ts" />

        <h3 id="untrack">untrack</h3>
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
                <code>untrack&lt;T&gt;(fn: () =&gt; T): T</code>
              </td>
              <td>在 fn 内读取 signal 不建立订阅关系。</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/signal-untrack.ts" lang="ts" />

        <h3 id="on">on</h3>
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
                <code>on(deps, fn, {"{ defer? }"}): EffectFn</code>
              </td>
              <td>
                显式依赖辅助器：仅当 <code>deps</code> 中声明的依赖变化时执行 <code>fn</code>
                ，fn 内的其他读取不建立依赖。返回的 <code>EffectFn</code> 需配合
                <code>effect(on(...))</code> 使用。
              </td>
            </tr>
          </tbody>
        </table>
        <p class="note">
          <code>fn</code> 收到上一次的依赖值（首跑为 <code>undefined</code>，除非
          <code>defer: true</code> 跳过首跑）。<code>deps</code> 是 getter 函数（或 getter
          数组），例如 <code>() =&gt; store.age.get()</code>。
        </p>
        <CodeBlock src="./assets/snippets/signal-on.ts" lang="ts" />
      </section>

      <section id="state" class="api-section">
        <h2>状态管理 — createStore</h2>
        <p>
          创建细粒度响应式对象存储。基于浅克隆（shallow-copy-on-read），每层都是代理节点 （proxy
          node），通过 <code>a.b.c.get()</code> 链式访问深层属性；底层信号经
          <code>node.signal</code> 暴露。
        </p>
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
                <code>createStore&lt;T&gt;(initial: T): Store&lt;T&gt;</code>
              </td>
              <td>
                返回嵌套响应式代理，每个节点暴露底层
                <code>Signal.State</code>（<code>node.signal</code>）。
              </td>
            </tr>
            <tr>
              <td>
                <code>ref(value)</code> / <code>isRef(value)</code>
              </td>
              <td>
                <code>ref()</code>
                包裹的值是<strong>终结点</strong>：不会被代理（保持原引用恒等），
                适合类实例、自引用结构等；写入时用 <code>.set(ref(next))</code>。
              </td>
            </tr>
          </tbody>
        </table>
        <h3>核心特性</h3>
        <ul style={ulStyle}>
          <li>
            <strong>链式访问：</strong>
            <code>store.a.b.c.get()</code> 直接访问深层属性，无需中间 <code>.get()</code>。
          </li>
          <li>
            <strong>底层信号：</strong>每个节点暴露
            <code>node.signal</code>（<code>Signal.State</code>），可直接交给 JSX 或
            <code>computed</code>。
          </li>
          <li>
            <strong>细粒度订阅：</strong>只订阅被访问的属性，修改 <code>store.age</code> 不触发
            <code>store.name</code> 的 watcher。
          </li>
          <li>
            <strong>向上传播：</strong>修改 <code>store.user.age</code> 会通知
            <code>store.user</code> 的 watcher。
          </li>
          <li>
            <strong>自动包裹：</strong>
            <code>.set()</code> 传入普通对象后，深层属性同样可链式访问
            （类型层面仍按初始形状约束）。
          </li>
          <li>
            <strong>旧引用保持有效：</strong>读取始终经过实时根节点，父级替换后旧引用读到新值。
          </li>
        </ul>
        <CodeBlock src="./assets/snippets/signal-store.ts" lang="ts" />
      </section>

      <section id="resource" class="api-section">
        <h2>异步数据 — createResource</h2>
        <p>
          把异步拉取封装为 <code>data</code> / <code>loading</code> /<code>error</code>{" "}
          三个标准信号。<code>source</code>
          中的信号依赖变化时自动重新拉取，并发安全 （旧请求的迟到结果不会覆盖新请求）；
          <code>refetch()</code>
          手动重拉。
        </p>
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
                <code>createResource&lt;T&gt;(fetcher, options?): Resource&lt;T&gt;</code>
              </td>
              <td>
                <code>fetcher(source)</code> 返回 Promise；<code>data</code> /<code>loading</code> /{" "}
                <code>error</code> 均为标准信号。
              </td>
            </tr>
            <tr>
              <td>
                <code>options.initial</code>
              </td>
              <td>
                首次加载完成前 <code>data</code> 的初值（如缓存）。
              </td>
            </tr>
            <tr>
              <td>
                <code>options.source</code>
              </td>
              <td>getter：其中读取的信号依赖变化时自动重新拉取。</td>
            </tr>
            <tr>
              <td>
                <code>resource.refetch()</code> / <code>dispose()</code>
              </td>
              <td>手动重拉；停止监听与在途请求（effect 内创建时自动清理）。</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/signal-resource.ts" lang="ts" />
      </section>

      <section id="lowlevel" class="api-section">
        <h2>事件与底层</h2>

        <h3 id="emitter">createEmitter</h3>
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
                <code>createEmitter&lt;Events&gt;(): Emitter&lt;Events&gt;</code>
              </td>
              <td>创建类型化事件发射器（on / once / off / emit / hasListeners / clear）。</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock src="./assets/snippets/signal-emitter.ts" lang="ts" />

        <h3 id="watcher">createWatcher</h3>
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
                <code>createWatcher(cb: () =&gt; void): Signal.subtle.Watcher</code>
              </td>
              <td>
                创建标准 watcher，手动 <code>watch</code> / <code>unwatch</code> 信号。
              </td>
            </tr>
          </tbody>
        </table>
        <p class="note">
          通常不需要直接使用 watcher——<code>effect</code> 与 JSX 绑定已经封装了订阅管理。
          当你需要手动控制订阅生命周期时才用到它。
        </p>
        <CodeBlock src="./assets/snippets/signal-watcher.ts" lang="ts" />
      </section>

      <section id="example" class="api-section">
        <h2>完整示例</h2>
        <p>综合使用 createSignal、computed、effect、batch、onCleanup 与 on 的购物车示例：</p>
        <CodeBlock src="./assets/snippets/signal-complete.ts" lang="ts" />
      </section>
    </div>
  </Layout>,
  document.getElementById("root")!,
)
