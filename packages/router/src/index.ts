export { createRouter, getRouteProps } from "./router"
export { Router, Route, Link, Outlet, Navigate } from "./components"
export {
  useRouter,
  useParams,
  useQuery,
  useLocation,
  useRoute,
  tryUseRouter,
  setActiveRouter,
} from "./hooks"
export {
  redirect,
  redirectReplace,
  buildPath,
  getQueryValue,
  pathsEqual,
  useNavigate,
} from "./utils"
export { createAuthGuard, combineGuards, createAsyncGuard } from "./guards"
export { createPathHistory, createHashHistory } from "./history"
export type {
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
  RouterState,
  Router as RouterInstance,
  RouterOptions,
} from "./types"
export type { Matcher } from "./matcher"
export type { HistoryAdapter } from "./history"
