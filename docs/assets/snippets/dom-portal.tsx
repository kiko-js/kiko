/** @jsxImportSource @kikojs/dom */
import { createPortal, createSignal } from "@kikojs/dom"

const open = createSignal(false)

// 模态框渲染到 body，原位置只留锚点注释；锚点随宿主树一起 dispose
const anchor = createPortal(<div className="modal">modal content</div>, document.body)

// 信号子节点先经 jsx 创建再整体移入，响应式更新与清理机制保持不变
const status = createPortal(<p>{open}</p>, document.body)

open.set(true) // <p> 内容随之更新
