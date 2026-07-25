import { createRouter, Router, Route } from "@kikojs/router"

const router = createRouter({ mode: "path" })

function App() {
  return (
    <Router router={router}>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <Route path="/" component={() => <h1>Home</h1>} />
      <Route path="/about" component={() => <h1>About</h1>} />
    </Router>
  )
}
