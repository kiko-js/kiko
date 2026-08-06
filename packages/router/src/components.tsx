/** @jsxImportSource @kikojs/dom */
import { effect } from "@kikojs/signal"
import { jsx } from "@kikojs/dom"
import { cleanupWatchers, swapNodes, toNodes, trackCleanup } from "@kikojs/dom/jsx-runtime"
import { getActiveRouter, setActiveRouter } from "./context"
import { getRouteProps } from "./router"
import type { RouteComponentProps, RouteGuard, RouteLocation, Router } from "./types"

interface RouterProps {
  router: Router
  children?: unknown
}

export function Router(props: RouterProps): Node {
  const router = props.router
  setActiveRouter(router)

  const container = document.createDocumentFragment()
  if (props.children) {
    const nodes = toNodes(props.children)
    for (const node of nodes) {
      container.appendChild(node)
    }
  }

  trackCleanup(container, () => {
    setActiveRouter(null)
    router.dispose()
  })

  return container
}

export interface RouteProps {
  path: string
  component?: (props: RouteComponentProps) => Node
  children?: unknown
  meta?: Record<string, unknown>
  beforeEnter?: RouteGuard
  beforeLeave?: RouteGuard
  redirect?: (to: RouteLocation, from: RouteLocation | null) => string | Promise<string>
  redirectTo?: string
}

export function Route(_props: RouteProps): Node {
  // Route 组件只在声明式路由表配置中通过 routes 数组使用，组件本身不渲染 DOM。
  return document.createComment("route")
}

interface LinkProps {
  to: string
  replace?: boolean
  state?: unknown
  children?: unknown
  class?: string
  activeClass?: string
  exact?: boolean
  [key: string]: unknown
}

export function Link(props: LinkProps): Node {
  const { to, replace, state, activeClass, exact, children, ...rest } = props

  const anchor = jsx("a", {
    ...rest,
    href: to,
    onClick: (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
      const target = (e.currentTarget as HTMLAnchorElement).getAttribute("target")
      if (target && target !== "_self") return
      e.preventDefault()
      // JSX children 先于父组件求值：Link 创建时 Router 尚未 setActiveRouter，
      // 因此点击时惰性解析——模块槽位在 Router 挂载后保持有效。
      const router = getActiveRouter()
      if (router) {
        router.navigate(to, { replace, state })
      } else {
        window.location.href = to
      }
    },
  })

  if (activeClass) {
    const el = anchor as HTMLElement
    effect(() => {
      const router = getActiveRouter()
      if (!router) return
      const loc = router.location.get()
      const match = exact ? loc.path === to : loc.path.startsWith(to)
      const cls = match ? activeClass : ""
      if (cls) {
        el.classList.add(cls)
      } else {
        const classes = activeClass.split(" ")
        for (const c of classes) {
          if (c) el.classList.remove(c)
        }
      }
    })
  }

  if (children) {
    const nodes = toNodes(children)
    for (const node of nodes) {
      anchor.appendChild(node)
    }
  }

  return anchor
}

interface OutletProps {
  router?: Router
}

export function Outlet(props: OutletProps): Node {
  const router = props.router ?? getActiveRouter()
  if (!router) {
    throw new Error("Outlet must be used inside a Router component or receive a router prop")
  }

  const marker = document.createComment("outlet")
  const parent = document.createDocumentFragment()
  parent.appendChild(marker)

  let currentNodes: Node[] = []

  const dispose = effect(() => {
    const route = router.currentRoute.get()
    const next: Node[] = []
    if (route?.component) {
      try {
        const node = route.component(getRouteProps(router))
        next.push(node)
      } catch (err) {
        reportError(err)
        next.push(document.createTextNode(""))
      }
    }
    currentNodes = swapNodes(marker, currentNodes, next)
  })

  trackCleanup(parent, () => {
    cleanupWatchers(parent)
    dispose()
  })

  return parent
}

interface NavigateProps {
  to: string
  replace?: boolean
  state?: unknown
}

export function Navigate(props: NavigateProps): Node {
  const router = getActiveRouter()
  if (!router) {
    throw new Error("Navigate must be used inside a Router component")
  }
  router.navigate(props.to, { replace: props.replace ?? true, state: props.state })
  return document.createComment("navigate")
}
