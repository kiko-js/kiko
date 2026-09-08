/** @jsxImportSource @kikojs/dom */
import { Show, createSignal, childrenToArray, childTag, childProps } from "@kikojs/dom"
import { computed } from "@kikojs/signal"

// --- 1. 没选中的分支不会执行，直接写组件 ---
const ready = createSignal(false)

const basic = (
  <Show when={ready} fallback={<p>加载中…</p>}>
    <p>内容已就绪</p>
  </Show>
)

// 需要 `when` 的值时写成函数
const withValue = <Show when={ready}>{value => <p>{String(value)}</p>}</Show>

// --- 2. 父组件按数据选分支：把分支包一层信号，数据变化时整块自动替换 ---
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

// --- 3. Tabs 按类型挑子组件：没选中的不会创建 ---
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
