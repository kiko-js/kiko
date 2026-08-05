/** @jsxImportSource @kikojs/dom */
import { createSignal, render } from "@kikojs/dom"

function App() {
  const count = createSignal(0)
  return <button onClick={() => count.set(count.get() + 1)}>{count}</button>
}

// 挂载 JSX 树，返回 dispose 用于整体卸载
const dispose = render(<App />, document.getElementById("app")!)

// 卸载整棵树：清理所有 watcher、事件监听与 ref 清理回调
dispose()
