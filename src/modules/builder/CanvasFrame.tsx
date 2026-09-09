'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PageRenderer,
  type RenderablePageSection,
} from '@/modules/sections/PageRenderer'
import type { PageTheme } from '@/modules/sections/types'
import type { StorefrontCommerce } from '@/modules/sections/registry'
import {
  elementSelector,
  type CanvasElementInfo,
  type CanvasElementRef,
  type CanvasRect,
  type CanvasToShellMessage,
  type ShellToCanvasMessage,
} from './canvasBridge'

export type { CanvasUpdateMessage } from './canvasBridge'

/**
 * The page, inside the builder's iframe.
 *
 * Two jobs. It renders the draft through the same registry the published site
 * uses — unchanged, and the reason the preview can be trusted. And it acts as
 * the shell's eyes on the DOM: which element the pointer is over, which one was
 * clicked, and where the selected one currently sits.
 *
 * It reports; it does not decide. No selection state lives here, no styling is
 * applied here, and no drag maths happens here — all of that is the shell's,
 * which is the only side that knows the scale the frame is drawn at. Keeping
 * the split that clean is what stops the same geometry being computed in two
 * places and disagreeing.
 */
export function CanvasClient({
  initialTheme,
  initialSections,
  commerce,
}: {
  initialTheme: PageTheme
  initialSections: RenderablePageSection[]
  /**
   * What the page sells. Resolved on the server and passed through unchanged —
   * the canvas is where a merchant checks their offers actually appear, so
   * rendering the form with no offers here would misreport the live page.
   *
   * Absent for a template preview, which has no page and therefore nothing to
   * sell.
   */
  commerce?: StorefrontCommerce
}) {
  const [theme, setTheme] = useState(initialTheme)
  const [sections, setSections] = useState(initialSections)
  // Kept in a ref rather than state: it changes on every selection and is only
  // ever read inside event handlers, so putting it in state would re-render the
  // whole page preview for something nothing renders.
  const selection = useRef<{ sectionId: string; elementKey: string } | null>(
    null
  )
  /**
   * The element currently being typed into, if any.
   *
   * Editing happens on the page itself rather than in a panel field, which is
   * the whole point — a merchant retypes a headline where they can see it sit.
   * The node keeps its own markup while this is set, and the shell stops
   * re-rendering the canvas for the duration, because a re-render would replace
   * the node under the caret and throw the merchant back to the start of the
   * line on every keystroke.
   */
  const editing = useRef<{
    node: HTMLElement
    sectionId: string
    elementKey: string
    index?: number
  } | null>(null)

  const post = useCallback((message: CanvasToShellMessage) => {
    window.parent.postMessage(message, window.location.origin)
  }, [])

  /**
   * Ends an inline edit and hands the final markup to the shell.
   *
   * `done: true` is what tells the shell it may start re-rendering the canvas
   * again — while an edit is live it must not, or the node under the caret is
   * replaced mid-sentence.
   */
  const stopEditing = useCallback(() => {
    const current = editing.current
    if (!current) return
    editing.current = null
    current.node.contentEditable = 'false'
    current.node.blur()
    post({
      type: 'ncom:element-text',
      sectionId: current.sectionId,
      elementKey: current.elementKey,
      index: current.index,
      html: current.node.innerHTML,
      done: true,
    })
  }, [post])

  const measure = useCallback(() => {
    const current = selection.current
    if (!current) {
      post({ type: 'ncom:element-geometry', element: null })
      return
    }
    const node = findElement(current.sectionId, current.elementKey)
    post({
      type: 'ncom:element-geometry',
      element: node ? describe(node, current.sectionId) : null,
    })
  }, [post])

  useEffect(() => {
    function handleMessage(event: MessageEvent<ShellToCanvasMessage>) {
      // Only the builder shell, on this same origin, may drive the canvas.
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'ncom:builder-update') {
        setTheme(data.theme)
        setSections(
          data.sections.map((s) => ({
            id: s.id,
            order: 0,
            type: s.type,
            content: s.content,
            config: s.config,
            isVisible: s.isVisible,
          }))
        )
        return
      }

      if (data.type === 'ncom:set-selection') {
        selection.current =
          data.sectionId && data.elementKey
            ? { sectionId: data.sectionId, elementKey: data.elementKey }
            : null
        // Measured on the next frame: the style change that usually accompanies
        // a selection has not been laid out yet at this point, and measuring
        // now would report the box the element is about to stop occupying.
        requestAnimationFrame(measure)
        return
      }

      if (data.type === 'ncom:measure') {
        requestAnimationFrame(measure)
        return
      }

      if (data.type === 'ncom:edit-element') {
        stopEditing()
        if (!data.elementKey) return
        const node = findElement(data.sectionId, data.elementKey)
        if (!node) return

        const ref = refFor(node)
        editing.current = {
          node,
          sectionId: data.sectionId,
          elementKey: data.elementKey,
          index: ref.index,
        }
        node.contentEditable = 'true'
        node.spellcheck = false
        // A selected word is what a merchant expects after a double-click, and
        // it means the first thing they type replaces the placeholder copy
        // rather than landing beside it.
        node.focus({ preventScroll: true })
        const range = document.createRange()
        range.selectNodeContents(node)
        const selectionApi = window.getSelection()
        selectionApi?.removeAllRanges()
        selectionApi?.addRange(range)
        return
      }

      if (data.type === 'ncom:reveal') {
        document
          .querySelector(`[data-section-id="${cssEscape(data.sectionId)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    window.addEventListener('message', handleMessage)
    // Tell the parent we're ready to receive updates.
    window.parent.postMessage(
      { type: 'ncom:canvas-ready' },
      window.location.origin
    )
    return () => window.removeEventListener('message', handleMessage)
  }, [measure, stopEditing])

  // The selected element moves whenever anything above it reflows — a style
  // edit, an image loading, the merchant scrolling. Each of these re-reports
  // its box so the shell's outline and toolbar stay glued to it.
  useEffect(() => {
    const onScroll = () => measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    const observer = new ResizeObserver(() => measure())
    observer.observe(document.body)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      observer.disconnect()
    }
  }, [measure])

  // Re-measured after every draft change, because the edit that just arrived is
  // usually the one that moved the element.
  useEffect(() => {
    requestAnimationFrame(measure)
  }, [sections, theme, measure])

  // Inline editing's own listeners, bound to the document rather than to the
  // node: the node comes and goes with every re-render, and a listener attached
  // to one instance would be gone the moment the shell sent an update.
  useEffect(() => {
    function onInput() {
      const current = editing.current
      if (!current) return
      post({
        type: 'ncom:element-text',
        sectionId: current.sectionId,
        elementKey: current.elementKey,
        index: current.index,
        html: current.node.innerHTML,
        done: false,
      })
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!editing.current) return
      // Escape and Enter both mean "done". Enter would otherwise split a
      // headline into two paragraphs, which no block's content field can hold.
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault()
        stopEditing()
      }
    }

    function onPointerDownOutside(event: PointerEvent) {
      const current = editing.current
      if (!current) return
      if (event.target instanceof Node && current.node.contains(event.target)) {
        return
      }
      stopEditing()
    }

    document.addEventListener('input', onInput)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDownOutside, true)
    return () => {
      document.removeEventListener('input', onInput)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDownOutside, true)
    }
  }, [post, stopEditing])

  useEffect(() => {
    function elementAt(target: EventTarget | null): CanvasElementInfo | null {
      if (!(target instanceof Element)) return null
      const node = target.closest('[data-el]')
      if (!(node instanceof HTMLElement)) return null
      const section = node.closest('[data-section-id]')
      const sectionId = section?.getAttribute('data-section-id')
      return sectionId ? describe(node, sectionId) : null
    }

    function onPointerMove(event: PointerEvent) {
      post({ type: 'ncom:element-hover', element: elementAt(event.target) })
    }

    function onPointerLeave() {
      post({ type: 'ncom:element-hover', element: null })
    }

    function onMouseDown(event: MouseEvent) {
      // Typing inside the element being edited needs its focus.
      if (
        editing.current &&
        event.target instanceof Node &&
        editing.current.node.contains(event.target)
      ) {
        return
      }
      // Everything else: refuse focus. Without this, clicking the phone field
      // in the preview focuses a real input, and the browser scrolls it into
      // view — so selecting a control makes the page jump under the merchant.
      // The canvas is a picture of the page, not the page.
      if (!(event.target instanceof Element)) return
      if (
        event.target.closest(
          'input, textarea, select, button, a, [contenteditable]'
        )
      ) {
        event.preventDefault()
      }
    }

    function onClick(event: MouseEvent) {
      // A click inside the words being typed is a caret move, not a selection.
      if (
        editing.current &&
        event.target instanceof Node &&
        editing.current.node.contains(event.target)
      ) {
        return
      }
      const element = elementAt(event.target)
      if (!element) return
      // A click in the canvas is a selection, not a visit. Without this, every
      // click on a CTA would navigate the preview to the order form and every
      // click on the form would try to place an order.
      event.preventDefault()
      event.stopPropagation()
      post({ type: 'ncom:element-click', element, edit: event.detail >= 2 })
    }

    document.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('mousedown', onMouseDown, true)
    // Capture, so a block's own handler cannot swallow the click before the
    // editor sees it — the FAQ accordion and the order form both stop
    // propagation on their controls.
    document.addEventListener('click', onClick, true)

    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [post])

  return (
    <PageRenderer
      theme={theme}
      sections={sections}
      commerce={commerce}
      editing
    />
  )
}

/** `getBoundingClientRect` as a plain object the structured clone can carry. */
function toRect(node: Element): CanvasRect {
  const box = node.getBoundingClientRect()
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  }
}

/** An element's `data-el` key and instance, as the shell addresses it. */
function refFor(node: Element): CanvasElementRef {
  const rawIndex = node.getAttribute('data-el-i')
  const index = rawIndex === null ? undefined : Number(rawIndex)
  return {
    elementKey: node.getAttribute('data-el') ?? '',
    index: Number.isInteger(index) ? index : undefined,
  }
}

function describe(node: HTMLElement, sectionId: string): CanvasElementInfo {
  // `offsetParent` is exactly what `top`/`left` resolve against, so reporting
  // its box is what lets the shell turn a drop point into the numbers CSS will
  // actually use. It is null for a fixed-position or hidden element, where the
  // viewport is the reference instead.
  const parent = node.offsetParent ?? document.documentElement

  // Walked here rather than derived in the shell: an element key says nothing
  // about what contains it, and only the DOM knows. The walk stops at the
  // section, because a selection never crosses a block.
  const ancestors: CanvasElementRef[] = []
  const section = node.closest('[data-section-id]')
  for (
    let cursor = node.parentElement;
    cursor && cursor !== section;
    cursor = cursor.parentElement
  ) {
    if (cursor.hasAttribute('data-el')) ancestors.unshift(refFor(cursor))
  }

  return {
    sectionId,
    ...refFor(node),
    ancestors: ancestors.length ? ancestors : undefined,
    rect: toRect(node),
    parentRect: toRect(parent),
  }
}

function findElement(sectionId: string, key: string): HTMLElement | null {
  const selector = elementSelector(key)
  if (!selector) return null
  const scope = document.querySelector(
    `[data-section-id="${cssEscape(sectionId)}"]`
  )
  const found = scope?.querySelector(selector)
  return found instanceof HTMLElement ? found : null
}

/**
 * Section ids are cuids, or the builder's own `temp-<uuid>`. Escaping rather
 * than trusting them keeps a malformed id from turning a `querySelector` into a
 * syntax error that would take the whole canvas down.
 */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&')
}
