import {
  buildPath,
  getQueryValue,
  pathsEqual,
  redirect,
  redirectReplace,
  navigateFrom,
} from "@kikojs/router"
import type { RouterInstance } from "@kikojs/router"

// 示例 router（实际来自 createRouter()）
declare const router: RouterInstance

buildPath("/users/1", { tab: "posts", page: "2" }) // "/users/1?tab=posts&page=2"
getQueryValue({ tab: ["a", "b"] }, "tab") // "a" —— 数组取首项

pathsEqual("/a?x=1", "/a/") // true —— 忽略查询串与尾部斜杠

redirect("/login") // { path: "/login" } —— push 语义
redirectReplace("/login") // { path: "/login", replace: true } —— replace 语义

// navigateFrom 绑定 router，返回导航函数（组件内请用 useNavigate() hook）
const navigate = navigateFrom(router)
navigate("/about", { replace: true })
