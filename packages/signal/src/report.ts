/**
 * 安全的上报钩子。
 *
 * 优先使用宿主 `globalThis.reportError`（调用时查找，测试可 monkey-patch）；
 * 缺失时（旧 Node / 某些嵌入式宿主）退回 `console.error`。上报本身抛错时
 * 静默吞掉——调度器 / effect 的错误隔离路径不能因为上报失败而中断。
 */
export function reportError(err: unknown): void {
  try {
    if (typeof globalThis.reportError === "function") {
      globalThis.reportError(err)
    } else {
      console.error(err)
    }
  } catch {
    // 上报失败不能影响调用方（如调度器的 flush 循环）
  }
}
