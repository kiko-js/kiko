import html from "./index.html"
const PORT = Number(process.env.PORT || "3000")

Bun.serve({
  port: PORT,
  routes: {
    "/*": html,
  },
})

console.log(`Server running at http://localhost:${PORT}`)
