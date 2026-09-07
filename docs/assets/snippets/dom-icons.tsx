/** @jsxImportSource @kikojs/dom */
import { createSignal } from "@kikojs/dom"
import type { Props, WatchableSignal } from "@kikojs/dom"

// 图标库接入：kiko 原生渲染 SVG（createElementNS），三种常见方式——

// 1. 内联 SVG（推荐）：从 lucide / heroicons 复制 <svg> 内层图形，
// 粘贴为 JSX 即可。strokeWidth 等驼峰属性自动归一化为 stroke-width，
// size / color 接受 signal，变化时只更新对应属性。
interface IconProps extends Props {
  size?: number | WatchableSignal<number>
  color?: string | WatchableSignal<string>
}

function HeartIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.color ?? "currentColor"}
      strokeWidth={2}
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  )
}

// 2. SVG 字符串注入：iconify / lucide-static 等返回 SVG 字符串时，
// 用 innerHTML 挂载（运行时走 IDL 属性赋值，同样支持 signal 响应式更新）。
const rocketSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>`
const rocket = <span innerHTML={rocketSvg} />

// 3. 字体图标：Font Awesome / Material Symbols 只需引入样式，
// 用 <i> + 类名即可，无需 JS 胶水。
// <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
const fontIcon = <i class="fa-solid fa-house" />

// 组合：signal 驱动颜色，组件函数只执行一次、按绑定细粒度更新。
const color = createSignal("currentColor")
const view = (
  <button onClick={() => color.set(color.get() === "red" ? "currentColor" : "red")}>
    <HeartIcon size={20} color={color} />
  </button>
)
