/** @jsxImportSource @kikojs/dom */
const view = (
  <div
    ref={(el: HTMLElement) => {
      const observer = new ResizeObserver((entries) => console.log(entries))
      observer.observe(el)
      // 返回清理函数：卸载（Show 切换 / dispose / 结构替换）时自动调用
      return () => observer.disconnect()
    }}
  />
)
