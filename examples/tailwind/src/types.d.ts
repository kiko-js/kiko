declare global {
  namespace JSX {
    type IntrinsicElements = {
      [tag in keyof HTMLElementTagNameMap]: Record<string, unknown>
    }
  }
}

export {}
