/** @jsxImportSource @kikojs/dom */
import { Show, createSignal, childrenToArray, childTag, childProps } from "@kikojs/dom"
import { computed } from "@kikojs/signal"

// --- 1. 静态 children 已是惰性的：未选中分支的组件体不执行，无需包函数 ---
const ready = createSignal(false)

const basic = (
  <Show when={ready} fallback={<p>加载中…</p>}>
    <p>内容已就绪</p>
  </Show>
)

// 函数形态只在需要 `when` 的值时使用（每次 when 变化重跑）
const withValue = <Show when={ready}>{value => <p>{String(value)}</p>}</Show>

// --- 2. 父组件按业务选择子分支：computed signal children，变化时整块子树替换 ---
function A() {
  return <p>分支 A</p>
}
function B() {
  return <p>分支 B</p>
}

function Parent() {
  const tab = createSignal<"a" | "b">("a")
  const body = computed(() => (tab.get() === "a" ? <A /> : <B />))
  return (
    <div>
      <button onClick={() => tab.set("b")}>切到 B</button>
      {body}
    </div>
  )
}

// --- 3. Tabs 式筛选：读占位的 tag/props，不执行未选中的子组件体 ---
function Tab(props: { name: string }) {
  return <span>{props.name}</span>
}
function Tabs(props: { active: string; children: unknown }) {
  const picked = childrenToArray(props.children).filter((child: unknown) => {
    if (childTag(child) !== Tab) return false
    const p = childProps(child)
    return typeof p === "object" && p !== null && "name" in p && p.name === props.active
  })
  return <div>{picked}</div>
}

const tabs = (
  <Tabs active="b">
    <Tab name="a" />
    <Tab name="b" />
  </Tabs>
)

void basic
void withValue
void Parent
void tabs
