export { createRouter, getRouteProps } from "./router"
export { Router, Link, Outlet, Navigate } from "./components"
export {
  useRouter,
  useParams,
  useQuery,
  useLocation,
  useRoute,
  tryUseRouter,
  useNavigate,
  setActiveRouter,
  type ReactiveSnapshot,
} from "./hooks"
export {
  redirect,
  redirectReplace,
  buildPath,
  getQueryValue,
  pathsEqual,
  navigateFrom,
  defineRoutes,
} from "./utils"
export { createPathHistory, createHashHistory, createMemoryHistory } from "./history"
export type {
  KeepAlive,
  KeepAliveOptions,
  RouteParams,
  RouteQuery,
  RouteMode,
  RouteLocation,
  NavigateOptions,
  RouteRecord,
  RouteComponentProps,
  RouteGuardResult,
  RedirectDescriptor,
  RouteGuard,
  RouteMatch,
  Router as RouterInstance,
  RouterOptions,
  PathParams,
  ParamsOf,
  RoutePaths,
  NavPath,
  RouterPaths,
  RouteMeta,
} from "./types"
export type { Matcher } from "./matcher"
export type { HistoryAdapter, HistoryLocation } from "./types"
