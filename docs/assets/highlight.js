document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("pre code[data-src]").forEach(async code => {
    const src = code.dataset.src
    if (!src) return
    const res = await fetch(src)
    code.textContent = await res.text()
    if (!code.className.includes("language-")) code.classList.add("language-typescript")
    if (window.hljs) hljs.highlightElement(code)
  })
})
