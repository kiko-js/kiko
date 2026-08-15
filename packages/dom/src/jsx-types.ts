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
import type { WatchableSignal } from "./signal"

/** A plain value or a signal of that value, as accepted by the runtime. */
type MaybeSignal<T> = T | WatchableSignal<T>

/** A function component: receives `props`, returns a DOM node. Generic over the
 *  concrete props shape so callers get type-checking at the call site. */
export type Component<P extends Props = Props> = (props: P) => Node

/** Event handler maps — the DOM prop name (`onClick`) → handler signature. */
export interface DOMEventHandlers {
  onClick?: MaybeSignal<(event: MouseEvent) => void>
  onAuxClick?: MaybeSignal<(event: MouseEvent) => void>
  onDblClick?: MaybeSignal<(event: MouseEvent) => void>
  onMouseDown?: MaybeSignal<(event: MouseEvent) => void>
  onMouseUp?: MaybeSignal<(event: MouseEvent) => void>
  onMouseMove?: MaybeSignal<(event: MouseEvent) => void>
  onMouseEnter?: MaybeSignal<(event: MouseEvent) => void>
  onMouseLeave?: MaybeSignal<(event: MouseEvent) => void>
  onMouseOver?: MaybeSignal<(event: MouseEvent) => void>
  onMouseOut?: MaybeSignal<(event: MouseEvent) => void>
  onKeyDown?: MaybeSignal<(event: KeyboardEvent) => void>
  onKeyUp?: MaybeSignal<(event: KeyboardEvent) => void>
  onKeyPress?: MaybeSignal<(event: KeyboardEvent) => void>
  onInput?: MaybeSignal<(event: InputEvent) => void>
  onChange?: MaybeSignal<(event: Event) => void>
  onFocus?: MaybeSignal<(event: FocusEvent) => void>
  onBlur?: MaybeSignal<(event: FocusEvent) => void>
  onSubmit?: MaybeSignal<(event: SubmitEvent) => void>
  onReset?: MaybeSignal<(event: Event) => void>
  onScroll?: MaybeSignal<(event: Event) => void>
  onLoad?: MaybeSignal<(event: Event) => void>
  onError?: MaybeSignal<(event: Event) => void>
  onTouchStart?: MaybeSignal<(event: TouchEvent) => void>
  onTouchMove?: MaybeSignal<(event: TouchEvent) => void>
  onTouchEnd?: MaybeSignal<(event: TouchEvent) => void>
  onPointerDown?: MaybeSignal<(event: PointerEvent) => void>
  onPointerUp?: MaybeSignal<(event: PointerEvent) => void>
  onPointerMove?: MaybeSignal<(event: PointerEvent) => void>
  onPointerOver?: MaybeSignal<(event: PointerEvent) => void>
  onPointerOut?: MaybeSignal<(event: PointerEvent) => void>
  onPointerEnter?: MaybeSignal<(event: PointerEvent) => void>
  onPointerLeave?: MaybeSignal<(event: PointerEvent) => void>
  onPointerCancel?: MaybeSignal<(event: PointerEvent) => void>
  onWheel?: MaybeSignal<(event: WheelEvent) => void>
  onContextMenu?: MaybeSignal<(event: MouseEvent) => void>
  onDrag?: MaybeSignal<(event: DragEvent) => void>
  onDragStart?: MaybeSignal<(event: DragEvent) => void>
  onDragEnd?: MaybeSignal<(event: DragEvent) => void>
  onDragEnter?: MaybeSignal<(event: DragEvent) => void>
  onDragLeave?: MaybeSignal<(event: DragEvent) => void>
  onDragOver?: MaybeSignal<(event: DragEvent) => void>
  onDrop?: MaybeSignal<(event: DragEvent) => void>
  onCopy?: MaybeSignal<(event: ClipboardEvent) => void>
  onCut?: MaybeSignal<(event: ClipboardEvent) => void>
  onPaste?: MaybeSignal<(event: ClipboardEvent) => void>
}

/** Attributes shared by every HTML element. The index signature keeps kiko's
 *  dynamic prop handling type-checkable for arbitrary keys. */
export interface HTMLAttributes<T extends HTMLElement> {
  children?: unknown
  ref?: ((el: T) => void | (() => void)) | { current: T | null }
  key?: string | number
  id?: MaybeSignal<string>
  class?: MaybeSignal<string>
  className?: MaybeSignal<string>
  style?: MaybeSignal<string | Record<string, string>>
  title?: MaybeSignal<string>
  lang?: MaybeSignal<string>
  dir?: MaybeSignal<string>
  hidden?: MaybeSignal<boolean>
  tabIndex?: MaybeSignal<number>
  role?: MaybeSignal<string>
  draggable?: MaybeSignal<boolean>
  spellcheck?: MaybeSignal<boolean>
  contentEditable?: MaybeSignal<boolean | "true" | "false">
  dataset?: MaybeSignal<Record<string, string>>
  [data: `data-${string}`]: unknown
  [aria: `aria-${string}`]: unknown
}

/** HTML attributes + DOM event handlers. */
export interface HTMLProps<T extends HTMLElement> extends HTMLAttributes<T>, DOMEventHandlers {}

/** Form-specific attributes. */
export interface FormProps extends HTMLProps<HTMLInputElement> {
  type?: MaybeSignal<string>
  value?: MaybeSignal<string | number | boolean>
  checked?: MaybeSignal<boolean>
  disabled?: MaybeSignal<boolean>
  placeholder?: MaybeSignal<string>
  name?: MaybeSignal<string>
  required?: MaybeSignal<boolean>
  readOnly?: MaybeSignal<boolean>
  autoFocus?: MaybeSignal<boolean>
  multiple?: MaybeSignal<boolean>
  min?: MaybeSignal<number | string>
  max?: MaybeSignal<number | string>
  step?: MaybeSignal<number | string>
  pattern?: MaybeSignal<string>
  autocomplete?: MaybeSignal<string>
}

/** `<a>`-specific. */
export interface AnchorProps extends HTMLProps<HTMLAnchorElement> {
  href?: MaybeSignal<string>
  target?: MaybeSignal<string>
  rel?: MaybeSignal<string>
  download?: MaybeSignal<string | boolean>
}

/** `<img>`-specific. */
export interface ImgProps extends HTMLProps<HTMLImageElement> {
  src?: MaybeSignal<string>
  alt?: MaybeSignal<string>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  loading?: MaybeSignal<"lazy" | "eager">
}

/** `<button>`-specific. */
export interface ButtonProps extends HTMLProps<HTMLButtonElement> {
  type?: MaybeSignal<"button" | "submit" | "reset">
  disabled?: MaybeSignal<boolean>
  name?: MaybeSignal<string>
  value?: MaybeSignal<string>
  form?: MaybeSignal<string>
}

/** SVG attributes — a permissive subset; SVG has its own attribute set. */
export interface SVGProps<T extends SVGElement> {
  children?: unknown
  ref?: ((el: T) => void | (() => void)) | { current: T | null }
  key?: string | number
  class?: MaybeSignal<string>
  className?: MaybeSignal<string>
  style?: MaybeSignal<string | Record<string, string>>
  id?: MaybeSignal<string>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  viewBox?: MaybeSignal<string>
  fill?: MaybeSignal<string>
  stroke?: MaybeSignal<string>
  strokeWidth?: MaybeSignal<number | string>
  d?: MaybeSignal<string>
  cx?: MaybeSignal<number | string>
  cy?: MaybeSignal<number | string>
  r?: MaybeSignal<number | string>
  x?: MaybeSignal<number | string>
  y?: MaybeSignal<number | string>
  x1?: MaybeSignal<number | string>
  y1?: MaybeSignal<number | string>
  x2?: MaybeSignal<number | string>
  y2?: MaybeSignal<number | string>
  points?: MaybeSignal<string>
  transform?: MaybeSignal<string>
  href?: MaybeSignal<string>
  [data: `data-${string}`]: unknown
  [aria: `aria-${string}`]: unknown
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
  // 异步组件（返回 Promise<Node>，需配合 <Suspend> 使用）也允许作为 JSX 元素；
  // 显式声明 ElementType 使 TS 走该联合而非默认的"构造函数返回 Element"。
  // `never` 参数经逆变接受任意 props 形状的组件（含无 props 组件）。
  export type ElementType = string | ((props: never) => Node) | ((props?: never) => Promise<Node>)
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
