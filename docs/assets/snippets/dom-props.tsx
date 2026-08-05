/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/dom"

const theme = createSignal("dark")

const view = (
  <div
    class="card" // 静态 class
    style={{ color: "#4cc38a" }} // 对象 style → 逐个设置 CSS 属性
    data-theme="dark" // 任意属性
    onClick={(e) => console.log(e.currentTarget)} // onXxx → addEventListener
  >
    {"字符串子节点"}
    {42}
    {theme} // signal 子节点 → 文本细粒度更新
  </div>
)
