/**
 * JSX type surface for `@kikojs/dom`.
 *
 * These are pure type declarations — no runtime. They make `jsxImportSource:
 * @kikojs/dom` type-check intrinsic elements (`<div />`, `<svg />`, ...), the
 * `ref`/`children`/`style` props, event handlers, and function components with
 * a generic props type. The runtime stays 100% signal-polyfill compatible; the
 * JSX namespace only shapes what the compiler accepts.
 *
 * The namespace is exported from `jsx-runtime.ts` so TypeScript's
 * `jsxImportSource` resolution picks it up.
 */

import type { Props } from "./jsx-runtime"

/** A function component: receives `props`, returns a DOM node. Generic over the
 *  concrete props shape so callers get type-checking at the call site. */
export type Component<P extends Props = Props> = (props: P) => Node

/** Event handler maps — the DOM prop name (`onClick`) → handler signature. */
export interface DOMEventHandlers {
  onClick?: (event: MouseEvent) => void
  onAuxClick?: (event: MouseEvent) => void
  onDblClick?: (event: MouseEvent) => void
  onMouseDown?: (event: MouseEvent) => void
  onMouseUp?: (event: MouseEvent) => void
  onMouseMove?: (event: MouseEvent) => void
  onMouseEnter?: (event: MouseEvent) => void
  onMouseLeave?: (event: MouseEvent) => void
  onMouseOver?: (event: MouseEvent) => void
  onMouseOut?: (event: MouseEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyUp?: (event: KeyboardEvent) => void
  onKeyPress?: (event: KeyboardEvent) => void
  onInput?: (event: InputEvent) => void
  onChange?: (event: Event) => void
  onFocus?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onSubmit?: (event: SubmitEvent) => void
  onReset?: (event: Event) => void
  onScroll?: (event: Event) => void
  onLoad?: (event: Event) => void
  onError?: (event: Event) => void
  onTouchStart?: (event: TouchEvent) => void
  onTouchMove?: (event: TouchEvent) => void
  onTouchEnd?: (event: TouchEvent) => void
}

/** Attributes shared by every HTML element. The index signature keeps kiko's
 *  dynamic prop handling type-checkable for arbitrary keys. */
export interface HTMLAttributes<T extends HTMLElement> {
  children?: unknown
  ref?: ((el: T) => void | (() => void)) | { current: T | null }
  key?: string | number
  id?: string
  class?: string
  className?: string
  style?: string | Record<string, string>
  title?: string
  lang?: string
  dir?: string
  hidden?: boolean
  tabIndex?: number
  role?: string
  draggable?: boolean
  spellcheck?: boolean
  contentEditable?: boolean | "true" | "false"
  dataset?: Record<string, string>
  [key: string]: unknown
}

/** HTML attributes + DOM event handlers. */
export interface HTMLProps<T extends HTMLElement> extends HTMLAttributes<T>, DOMEventHandlers {}

/** Form-specific attributes. */
export interface FormProps extends HTMLProps<HTMLInputElement> {
  type?: string
  value?: string | number | boolean
  checked?: boolean
  disabled?: boolean
  placeholder?: string
  name?: string
  required?: boolean
  readOnly?: boolean
  autoFocus?: boolean
  multiple?: boolean
  min?: number | string
  max?: number | string
  step?: number | string
  pattern?: string
  autocomplete?: string
}

/** `<a>`-specific. */
export interface AnchorProps extends HTMLProps<HTMLAnchorElement> {
  href?: string
  target?: string
  rel?: string
  download?: string | boolean
}

/** `<img>`-specific. */
export interface ImgProps extends HTMLProps<HTMLImageElement> {
  src?: string
  alt?: string
  width?: number | string
  height?: number | string
  loading?: "lazy" | "eager"
}

/** `<button>`-specific. */
export interface ButtonProps extends HTMLProps<HTMLButtonElement> {
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  name?: string
  value?: string
  form?: string
}

/** SVG attributes — a permissive subset; SVG has its own attribute set. */
export interface SVGProps<T extends SVGElement> {
  children?: unknown
  ref?: ((el: T) => void | (() => void)) | { current: T | null }
  key?: string | number
  class?: string
  className?: string
  style?: string | Record<string, string>
  id?: string
  width?: number | string
  height?: number | string
  viewBox?: string
  fill?: string
  stroke?: string
  strokeWidth?: number | string
  d?: string
  cx?: number | string
  cy?: number | string
  r?: number | string
  x?: number | string
  y?: number | string
  x1?: number | string
  y1?: number | string
  x2?: number | string
  y2?: number | string
  points?: string
  transform?: string
  href?: string
  [key: string]: unknown
}

/** Map of intrinsic HTML tag → props. */
export interface HTMLIntrinsicElements {
  a: AnchorProps
  abbr: HTMLProps<HTMLElement>
  address: HTMLProps<HTMLElement>
  article: HTMLProps<HTMLElement>
  aside: HTMLProps<HTMLElement>
  audio: HTMLProps<HTMLAudioElement>
  b: HTMLProps<HTMLElement>
  base: HTMLProps<HTMLBaseElement>
  bdi: HTMLProps<HTMLElement>
  bdo: HTMLProps<HTMLElement>
  blockquote: HTMLProps<HTMLQuoteElement>
  body: HTMLProps<HTMLBodyElement>
  br: HTMLProps<HTMLBRElement>
  button: ButtonProps
  canvas: HTMLProps<HTMLCanvasElement>
  caption: HTMLProps<HTMLTableCaptionElement>
  cite: HTMLProps<HTMLElement>
  code: HTMLProps<HTMLElement>
  col: HTMLProps<HTMLTableColElement>
  colgroup: HTMLProps<HTMLTableColElement>
  data: HTMLProps<HTMLDataElement>
  datalist: HTMLProps<HTMLDataListElement>
  dd: HTMLProps<HTMLElement>
  del: HTMLProps<HTMLModElement>
  details: HTMLProps<HTMLDetailsElement>
  dfn: HTMLProps<HTMLElement>
  dialog: HTMLProps<HTMLDialogElement>
  div: HTMLProps<HTMLDivElement>
  dl: HTMLProps<HTMLDListElement>
  dt: HTMLProps<HTMLElement>
  em: HTMLProps<HTMLElement>
  embed: HTMLProps<HTMLEmbedElement>
  fieldset: HTMLProps<HTMLFieldSetElement>
  figcaption: HTMLProps<HTMLElement>
  figure: HTMLProps<HTMLElement>
  footer: HTMLProps<HTMLElement>
  form: HTMLProps<HTMLFormElement>
  h1: HTMLProps<HTMLHeadingElement>
  h2: HTMLProps<HTMLHeadingElement>
  h3: HTMLProps<HTMLHeadingElement>
  h4: HTMLProps<HTMLHeadingElement>
  h5: HTMLProps<HTMLHeadingElement>
  h6: HTMLProps<HTMLHeadingElement>
  head: HTMLProps<HTMLHeadElement>
  header: HTMLProps<HTMLElement>
  hgroup: HTMLProps<HTMLElement>
  hr: HTMLProps<HTMLHRElement>
  html: HTMLProps<HTMLHtmlElement>
  i: HTMLProps<HTMLElement>
  iframe: HTMLProps<HTMLIFrameElement>
  img: ImgProps
  input: FormProps
  ins: HTMLProps<HTMLModElement>
  kbd: HTMLProps<HTMLElement>
  label: HTMLProps<HTMLLabelElement>
  legend: HTMLProps<HTMLLegendElement>
  li: HTMLProps<HTMLLIElement>
  link: HTMLProps<HTMLLinkElement>
  main: HTMLProps<HTMLElement>
  map: HTMLProps<HTMLMapElement>
  mark: HTMLProps<HTMLElement>
  menu: HTMLProps<HTMLMenuElement>
  meta: HTMLProps<HTMLMetaElement>
  meter: HTMLProps<HTMLMeterElement>
  nav: HTMLProps<HTMLElement>
  noscript: HTMLProps<HTMLElement>
  object: HTMLProps<HTMLObjectElement>
  ol: HTMLProps<HTMLOListElement>
  optgroup: HTMLProps<HTMLOptGroupElement>
  option: HTMLProps<HTMLOptionElement>
  output: HTMLProps<HTMLOutputElement>
  p: HTMLProps<HTMLParagraphElement>
  param: HTMLProps<HTMLParamElement>
  picture: HTMLProps<HTMLPictureElement>
  pre: HTMLProps<HTMLPreElement>
  progress: HTMLProps<HTMLProgressElement>
  q: HTMLProps<HTMLQuoteElement>
  rp: HTMLProps<HTMLElement>
  rt: HTMLProps<HTMLElement>
  ruby: HTMLProps<HTMLElement>
  s: HTMLProps<HTMLElement>
  samp: HTMLProps<HTMLElement>
  script: HTMLProps<HTMLScriptElement>
  section: HTMLProps<HTMLElement>
  select: HTMLProps<HTMLSelectElement>
  small: HTMLProps<HTMLElement>
  source: HTMLProps<HTMLSourceElement>
  span: HTMLProps<HTMLSpanElement>
  strong: HTMLProps<HTMLElement>
  style: HTMLProps<HTMLStyleElement> & { global?: boolean }
  sub: HTMLProps<HTMLElement>
  summary: HTMLProps<HTMLElement>
  sup: HTMLProps<HTMLElement>
  table: HTMLProps<HTMLTableElement>
  tbody: HTMLProps<HTMLTableSectionElement>
  td: HTMLProps<HTMLTableCellElement>
  template: HTMLProps<HTMLTemplateElement>
  textarea: HTMLProps<HTMLTextAreaElement>
  tfoot: HTMLProps<HTMLTableSectionElement>
  th: HTMLProps<HTMLTableCellElement>
  thead: HTMLProps<HTMLTableSectionElement>
  time: HTMLProps<HTMLTimeElement>
  title: HTMLProps<HTMLTitleElement>
  tr: HTMLProps<HTMLTableRowElement>
  track: HTMLProps<HTMLTrackElement>
  u: HTMLProps<HTMLElement>
  ul: HTMLProps<HTMLUListElement>
  var: HTMLProps<HTMLElement>
  video: HTMLProps<HTMLVideoElement>
  wbr: HTMLProps<HTMLElement>
}

/** Map of intrinsic SVG tag → props. */
export interface SVGIntrinsicElements {
  svg: SVGProps<SVGSVGElement>
  path: SVGProps<SVGPathElement>
  circle: SVGProps<SVGCircleElement>
  ellipse: SVGProps<SVGEllipseElement>
  rect: SVGProps<SVGRectElement>
  g: SVGProps<SVGGElement>
  defs: SVGProps<SVGDefsElement>
  use: SVGProps<SVGUseElement>
  symbol: SVGProps<SVGSymbolElement>
  linearGradient: SVGProps<SVGLinearGradientElement>
  radialGradient: SVGProps<SVGRadialGradientElement>
  stop: SVGProps<SVGStopElement>
  text: SVGProps<SVGTextElement>
  tspan: SVGProps<SVGTSpanElement>
  polygon: SVGProps<SVGPolygonElement>
  polyline: SVGProps<SVGPolylineElement>
  line: SVGProps<SVGLineElement>
  image: SVGProps<SVGImageElement>
  clipPath: SVGProps<SVGClipPathElement>
  mask: SVGProps<SVGMaskElement>
  pattern: SVGProps<SVGPatternElement>
  marker: SVGProps<SVGMarkerElement>
  filter: SVGProps<SVGFilterElement>
  animate: SVGProps<SVGElement>
  animateTransform: SVGProps<SVGElement>
  animateMotion: SVGProps<SVGElement>
  set: SVGProps<SVGElement>
  foreignObject: SVGProps<SVGForeignObjectElement>
  desc: SVGProps<SVGDescElement>
  metadata: SVGProps<SVGMetadataElement>
  switch: SVGProps<SVGSwitchElement>
  view: SVGProps<SVGViewElement>
}

/**
 * The JSX namespace consumed by `jsxImportSource: @kikojs/dom`.
 * `IntrinsicElements` is the union of HTML and SVG maps; an index signature
 * falls back to permissive props so custom/web-component tags still compile.
 */
export namespace JSX {
  export type Element = Node
  // kiko has no class components — only function `Component<P>`. `void`
  // makes any class-component usage a type error rather than silently
  // treating a class instance as a `Node`.
  export type ElementClass = void
  export interface ElementAttributesProperty {
    props: unknown
  }
  export type LibraryManagedAttributes<_C, P> = P
  export interface ElementChildrenAttribute {
    children: unknown
  }
  export type IntrinsicElements = HTMLIntrinsicElements &
    SVGIntrinsicElements & {
      [tag: string]: HTMLAttributes<HTMLElement>
    }
}
