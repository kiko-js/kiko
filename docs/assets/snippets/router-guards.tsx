import { createRouter, Router, Route, createAuthGuard } from "@kikojs/router"

const isLoggedIn = () => !!localStorage.getItem("token")
const authGuard = createAuthGuard(isLoggedIn, "/login")

const router = createRouter({
  mode: "path",
  guards: [authGuard],
})

function App() {
  return (
    <Router router={router}>
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
    </Router>
  )
}
