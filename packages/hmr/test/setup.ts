import { Window } from "happy-dom"

const window = new Window({
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
globalThis.DocumentFragment = window.DocumentFragment
// @ts-ignore
globalThis.Event = window.Event
// @ts-ignore
globalThis.MouseEvent = window.MouseEvent
// @ts-ignore
globalThis.FocusEvent = window.FocusEvent
// @ts-ignore
globalThis.KeyboardEvent = window.KeyboardEvent
// @ts-ignore
globalThis.InputEvent = window.InputEvent
// @ts-ignore
globalThis.CustomEvent = window.CustomEvent
