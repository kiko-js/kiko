/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/dom"
import { ReactPortal } from "@kikojs/dom/react-portal"
import { createElement } from "react"
import type { ComponentType } from "react"

// 任何 React 组件都能嵌入 kiko 树；signal prop 变化自动触发 React 重渲染
const MyChart: ComponentType<{ data: number[] }> = ({ data }) =>
  createElement("ul", null, data.map((n) => createElement("li", { key: n }, n)))

function App() {
  const data = createSignal([1, 2, 3])
  return <ReactPortal component={MyChart} data={data} />
}
