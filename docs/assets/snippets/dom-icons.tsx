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
      {/* 图标 path 从 lucide / heroicons 复制，示意从略 */}
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

// 2. SVG 字符串注入：iconify / lucide-static 等返回 SVG 字符串时，
const rocketSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><!-- 完整图形从 iconify 复制 --></svg>`
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
