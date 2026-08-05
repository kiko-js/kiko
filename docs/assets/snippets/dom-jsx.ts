import { jsx, Fragment, createSignal, render } from "@kikojs/dom"

const count = createSignal(0)

// jsx(tag, props) 与 JSX 编译结果完全等价：没有 JSX 编译器时的另一种写法
const view = jsx("div", {
  class: "counter",
  children: [
    jsx("button", { onClick: () => count.set(count.get() - 1), children: "-" }),
    jsx("span", { children: count }), // signal 子节点 → 文本细粒度更新
    jsx("button", { onClick: () => count.set(count.get() + 1), children: "+" }),
  ],
})

// Fragment：无包裹节点的多根内容
const frag = jsx(Fragment, {
  children: [jsx("li", { children: "a" }), jsx("li", { children: "b" })],
})

render(view, document.getElementById("app")!)
