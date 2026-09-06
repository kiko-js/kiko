import html from "./index.html"

const PORT = Number(process.env.PORT || "3003")

Bun.serve({
  port: PORT,
  development: {
    // 浏览器端 HMR + 终端回显
    hmr: true,
    console: true,
  },
  routes: {
    "/*": html,
  },
})

console.log(`HMR demo running at http://localhost:${PORT}`)
