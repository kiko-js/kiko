/** @jsxImportSource @kikojs/dom */
import { ErrorBoundary } from "@kikojs/dom"
import type { Component } from "@kikojs/dom"

// 渲染时抛错的组件
const RiskyComponent: Component = () => {
  throw new Error("boom")
}

const view = (
  <ErrorBoundary fallback={(err) => <p>出错了: {(err as Error).message}</p>}>
    {/* children 是延迟求值的函数，渲染错误在此被捕获 */}
    {() => <RiskyComponent />}
  </ErrorBoundary>
)
