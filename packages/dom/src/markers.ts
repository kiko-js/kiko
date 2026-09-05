/**
 * DOM 注释标记协议——客户端 anchor 与 SSR 序列化共用的唯一拼写源。
 *
 * kiko 用注释节点做结构锚点:客户端 `createComment(text)`,SSR 端序列化为
 * `<!--text-->`,水合靠同一拼写识别/对齐。任何一侧改动拼写都会静默破坏
 * 水合对齐——所以全部拼写集中在本模块,禁止散落硬编码。
 *
 * 控制流标记是「起始锚」:客户端在该 comment 后做分支交换,SSR 端输出
 * `<!--show-->` 等给水合端当对齐起点。`/suspend` 是唯一的「结束锚」:
 * Suspend 采纳需扫描到内容右边界。
 */

// 控制流组件锚(客户端 createComment 文本;SSR 用 markerHtml 包裹)
export const SHOW_MARKER = "show"
export const FOR_MARKER = "for"
export const ERROR_BOUNDARY_MARKER = "error-boundary"
export const SUSPEND_MARKER = "suspend"
/** Suspend 内容结束标记(水合对齐的右边界) */
export const SUSPEND_END_MARKER = "/suspend"

/** Portal 在宿主位置留下的锚 */
export const PORTAL_MARKER = "portal"

/** 信号子节点锚:客户端是空注释,SSR 序列化为固定拼写 */
export const SIGNAL_MARKER_HTML = "<!---->"

/** 客户端 scoped-style anchor 的文本前缀(applyScopeRoots 按 comment 文本识别) */
export const SCOPE_ANCHOR_PREFIX = "kiko-scope:"
/** 非作用域 <style> 的 anchor 文本(constructable sheets 模式) */
export const STYLE_ANCHOR_TEXT = "kiko-style"
/** SSR 端 scoped-style 内嵌标记:由最近的序列化祖先元素提取并挂到自身 attrs */
export const SCOPE_MARKER_PREFIX = "<!--kiko-scope:"
export const SCOPE_MARKER_SUFFIX = "-->"

/** 控制流标记的 SSR HTML 形式(`<!--text-->`) */
export function markerHtml(text: string): string {
  return `<!--${text}-->`
}
