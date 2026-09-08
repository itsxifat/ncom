import type { PageTheme } from '../sections/types'

/**
 * The contract between the builder shell and the canvas iframe.
 *
 * The canvas renders the page through the same registry the published site
 * uses, which is what makes the preview trustworthy — but it also means the
 * editor cannot reach into it with ordinary React. Everything crosses as a
 * `postMessage`, and this file is the only description of what those messages
 * are, so the two halves cannot drift.
 *
 * The division of labour is deliberate and worth stating, because it is what
 * keeps the drag maths from being written twice:
 *
 * - **The canvas reports geometry, it does not interpret it.** It answers "where
 *   is this element, and what is it positioned inside" in its own coordinate
 *   space, in CSS pixels, unscaled.
 * - **The shell owns the interaction.** It knows the scale factor the frame is
 *   drawn at, so it converts a pointer movement into canvas pixels, decides what
 *   that means (padding? offset? a position?), and writes to the store.
 *
 * Both sides check `event.origin` against their own. The canvas is same-origin
 * by construction; anything else posting into either window is not ours.
 */

// ── Shell → canvas ────────────────────────────────────────────────────

export interface CanvasUpdateMessage {
  type: 'ncom:builder-update'
  theme: PageTheme
  sections: {
    id: string
    type: string
    content: unknown
    config: unknown
    isVisible: boolean
  }[]
}

/**
 * Tells the canvas what is selected, so it can keep reporting that element's
 * box as the page reflows underneath it.
 */
export interface CanvasSelectMessage {
  type: 'ncom:set-selection'
  sectionId: string | null
  elementKey: string | null
}

/** Asks for a fresh measurement — after a style edit, a resize, a scroll. */
export interface CanvasMeasureMessage {
  type: 'ncom:measure'
}

/** Scrolls a section into view, for a click in the outline panel. */
export interface CanvasRevealMessage {
  type: 'ncom:reveal'
  sectionId: string
}

export type ShellToCanvasMessage =
  | CanvasUpdateMessage
  | CanvasSelectMessage
  | CanvasMeasureMessage
  | CanvasRevealMessage

// ── Canvas → shell ────────────────────────────────────────────────────

/**
 * A box in the canvas document's own coordinates: CSS pixels, relative to the
 * iframe's viewport, already accounting for the canvas's internal scroll.
 *
 * Unscaled on purpose — the frame's scale factor is the shell's business, and
 * baking it in here would mean re-measuring every time the editor window
 * changed size.
 */
export interface CanvasRect {
  top: number
  left: number
  width: number
  height: number
}

/** What the shell needs to know about one element to draw and drag it. */
export interface CanvasElementInfo {
  sectionId: string
  /** The shared element key, without an instance suffix. */
  elementKey: string
  /** Which instance was pointed at, for a repeated element. */
  index?: number
  rect: CanvasRect
  /**
   * The box this element is positioned inside — its offset parent.
   *
   * Sent because free positioning writes `top`/`left` against whatever the
   * nearest positioned ancestor happens to be, which depends on the block's own
   * markup. Reporting it means the shell converts a drop point into the right
   * numbers without needing to know anything about how a block is built.
   */
  parentRect: CanvasRect
}

export interface CanvasReadyMessage {
  type: 'ncom:canvas-ready'
}

export interface CanvasHoverMessage {
  type: 'ncom:element-hover'
  element: CanvasElementInfo | null
}

export interface CanvasClickMessage {
  type: 'ncom:element-click'
  element: CanvasElementInfo
  /** A double-click asks the shell to open this element's text for editing. */
  edit: boolean
}

/** The selected element's box, re-sent whenever the page moves under it. */
export interface CanvasGeometryMessage {
  type: 'ncom:element-geometry'
  element: CanvasElementInfo | null
}

export type CanvasToShellMessage =
  | CanvasReadyMessage
  | CanvasHoverMessage
  | CanvasClickMessage
  | CanvasGeometryMessage

// ── Element keys ──────────────────────────────────────────────────────

/**
 * An element key addressing one instance of a repeated element.
 *
 * `card` styles every card; `card#2` styles the third one. The suffix is the
 * whole difference, which is why it lives in one function rather than being
 * concatenated at each call site.
 */
export function instanceKey(elementKey: string, index: number): string {
  return `${elementKey}#${index}`
}

/** Splits an element key back into its shared part and its instance. */
export function parseElementKey(key: string): {
  base: string
  index?: number
} {
  const hash = key.indexOf('#')
  if (hash === -1) return { base: key }
  const index = Number(key.slice(hash + 1))
  return {
    base: key.slice(0, hash),
    index: Number.isInteger(index) ? index : undefined,
  }
}

/**
 * The DOM selector for an element key, scoped to a section.
 *
 * Kept next to the CSS generator's own selector builder in spirit: if these two
 * ever disagree, the editor would outline one element and style a different
 * one. Both refuse anything outside the identifier grammar rather than trying
 * to escape it.
 */
export function elementSelector(key: string): string | null {
  const { base, index } = parseElementKey(key)
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(base)) return null
  return index === undefined
    ? `[data-el="${base}"]`
    : `[data-el="${base}"][data-el-i="${index}"]`
}
