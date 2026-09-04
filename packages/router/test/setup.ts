import { Window } from "happy-dom"

const window = new Window({
  url: "http://localhost/",
  settings: {
    // happy-dom v20+ disables JS evaluation by default for security.
    // Enable it for tests (no untrusted code is executed).
    enableJavaScriptEvaluation: true,
  },
})
// @ts-ignore
globalThis.window = window
// @ts-ignore
globalThis.document = window.document
// @ts-ignore
globalThis.Node = window.Node
// @ts-ignore
globalThis.HTMLElement = window.HTMLElement
// @ts-ignore
globalThis.HTMLAnchorElement = window.HTMLAnchorElement
// @ts-ignore
globalThis.DocumentFragment = window.DocumentFragment
// @ts-ignore
globalThis.MouseEvent = window.MouseEvent
// @ts-ignore
globalThis.Event = window.Event
// @ts-ignore
globalThis.CustomEvent = window.CustomEvent
// @ts-ignore
globalThis.history = window.history
// @ts-ignore
globalThis.location = window.location
