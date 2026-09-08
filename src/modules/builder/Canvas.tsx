'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBuilderStore, styleBreakpoint, type Breakpoint } from './store'
import { getSectionDefinition } from '../sections/registry'
import { sectionExtras } from '../sections/elements'
import { extraDescriptor } from '../sections/elementDescriptors'
import { FloatingToolbar } from './FloatingToolbar'
import {
  parseElementKey,
  type CanvasElementInfo,
  type CanvasToShellMessage,
  type ShellToCanvasMessage,
} from './canvasBridge'
import { cn } from '@/lib/utils'

/**
 * The viewport each breakpoint button stands for.
 *
 * Both dimensions are load bearing, because the canvas document measures itself
 * against the iframe rather than against the editor's window.
 *
 * Width decides which media queries resolve. `desktop` used to have no width at
 * all — the iframe was `w-full` and simply took whatever was left between the
 * two panels, so the same page previewed at ~1296px on a 1080p display and at
 * ~816px on a laptop. The second of those is below Tailwind's `lg` breakpoint,
 * so a two-column `lg:` block silently previewed as one column that a real
 * visitor never sees. Tablet and mobile were wrong in the same way for the
 * opposite reason: `maxWidth: '100%'` squashed the 768px frame down to fit a
 * narrow pane, and the document then honestly reported the squashed width.
 *
 * Height is what `vh` is measured against, and it was previously the height of
 * the editor pane. That is the difference between a `full`-height hero
 * (`min-h-[85vh]`) filling the screen in preview and filling it in production.
 *
 * The frame is therefore pinned to real device dimensions and scaled down to
 * fit, so the preview says the same thing on every display the editor is opened
 * on.
 */
const DEVICE_VIEWPORTS: Record<Breakpoint, { width: number; height: number }> =
  {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 812 },
  }

/**
 * The live preview, and the primary editing surface.
 *
 * The page renders inside a same-origin iframe and the editor posts it the
 * current draft; the iframe resolves each block through the same registry the
 * published page uses, so what a merchant arranges is literally what a customer
 * sees. Nothing is compiled on the server on the way — every block is a React
 * component, so the draft travels as plain JSON and renders in one hop.
 *
 * On top of that sits the direct-manipulation layer: the canvas reports where
 * things are, and everything drawn over them — the hover outline, the selection
 * box, the handles, the toolbar — lives here, in the shell's own DOM. It is
 * drawn here rather than injected into the iframe for two reasons. The editor's
 * chrome would otherwise be inside the document being edited, where a merchant's
 * own CSS could restyle it; and the frame is scaled, so anything drawn inside it
 * would be scaled too and a 1px outline would stop being 1px.
 */
export function Canvas({
  canvasSrc,
  offersRevision = 0,
}: {
  canvasSrc: string
  /**
   * Bumped whenever the page's offers or delivery rules change.
   *
   * The order form is handed its offers by the canvas route on the server, not
   * over postMessage, so the only way to refresh it is to load the route again.
   */
  offersRevision?: number
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  // Measured rather than derived from the window: the space left for the canvas
  // depends on the two side panels, so window width alone would not give the
  // scale factor.
  const [shell, setShell] = useState({ width: 0, height: 0 })
  // A counter rather than a flag: the canvas announces itself on every load, so
  // a reloaded iframe has to be re-sent the sections it lost. With a boolean
  // the second announcement was a no-op state write and the post effect never
  // re-ran.
  const [readyToken, setReadyToken] = useState(0)
  const [hover, setHover] = useState<CanvasElementInfo | null>(null)
  const [geometry, setGeometry] = useState<CanvasElementInfo | null>(null)
  // Which instance of a repeated element was last clicked, so the toolbar can
  // offer "just this one" without making the merchant click the same card
  // again to say which one they meant.
  const [lastIndex, setLastIndex] = useState<number | undefined>(undefined)

  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const sections = useBuilderStore((s) => s.sections)
  const theme = useBuilderStore((s) => s.theme)
  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  const selectedElementKey = useBuilderStore((s) => s.selectedElementKey)
  const selectElement = useBuilderStore((s) => s.selectElement)

  const post = useCallback((message: ShellToCanvasMessage) => {
    iframeRef.current?.contentWindow?.postMessage(
      message,
      window.location.origin
    )
  }, [])

  useEffect(() => {
    const node = shellRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      // contentRect is the padding box's inside, so the p-6 gutter is already
      // excluded and the frame never scales into it.
      const { width, height } = entry.contentRect
      setShell({ width, height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function handleMessage(event: MessageEvent<CanvasToShellMessage>) {
      // The canvas is same-origin; anything else posting here is not ours.
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'ncom:canvas-ready') {
        setReadyToken((token) => token + 1)
        return
      }

      if (data.type === 'ncom:element-hover') {
        setHover(data.element)
        return
      }

      if (data.type === 'ncom:element-geometry') {
        setGeometry(data.element)
        return
      }

      if (data.type === 'ncom:element-click') {
        const { sectionId, elementKey, index } = data.element
        // A repeated element selects as "all of them" by default. Styling one
        // card out of nine is nearly always a mistake rather than a design, so
        // the shared key is the default and the panel offers the single
        // instance as an explicit choice.
        selectElement(sectionId, elementKey)
        setLastIndex(index)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [selectElement])

  // Skipped on mount — the iframe has just fetched the current offers by
  // definition.
  const lastReloadedRevision = useRef(offersRevision)
  useEffect(() => {
    if (lastReloadedRevision.current === offersRevision) return
    lastReloadedRevision.current = offersRevision
    iframeRef.current?.contentWindow?.location.reload()
  }, [offersRevision])

  useEffect(() => {
    if (readyToken === 0 || !theme) return
    post({
      type: 'ncom:builder-update',
      theme,
      sections: sections.map((s) => ({
        id: s.id,
        type: s.type,
        content: s.content,
        config: s.config,
        isVisible: s.isVisible,
      })),
    })
  }, [readyToken, sections, theme, post])

  useEffect(() => {
    if (readyToken === 0) return
    post({
      type: 'ncom:set-selection',
      sectionId: selectedSectionId,
      elementKey: selectedElementKey,
    })
  }, [readyToken, selectedSectionId, selectedElementKey, post])

  const viewport = DEVICE_VIEWPORTS[breakpoint]

  // Shrink to fit, never enlarge: scaling a 375px phone up to fill a wide pane
  // would be just as much of a lie as the old stretched desktop frame, only in
  // the other direction. Before the first measurement there is nothing to fit
  // against, so the frame starts at 1:1 and settles on the same tick.
  const scale =
    shell.width > 0 && shell.height > 0
      ? Math.min(
          1,
          shell.width / viewport.width,
          shell.height / viewport.height
        )
      : 1

  const selectedSection = sections.find((s) => s.id === selectedSectionId)
  const label = selectedElementKey
    ? elementLabel(selectedSection, selectedElementKey)
    : null

  // The hover outline is suppressed on the element already selected — two boxes
  // on the same element reads as a rendering bug, not as feedback.
  const showHover =
    hover &&
    !(
      hover.sectionId === selectedSectionId &&
      hover.elementKey === parseElementKey(selectedElementKey ?? '').base
    )

  return (
    <div ref={shellRef} className="bg-muted h-full overflow-auto p-6">
      {/*
        A transform does not affect layout, so this wrapper carries the frame's
        post-scale size. Without it, centring and the scroll extent would both be
        computed from the unscaled 1440px and the frame would sit off to one side.
        It is also the coordinate space every overlay below is positioned in.
      */}
      <div
        className="relative mx-auto"
        style={{
          width: viewport.width * scale,
          height: viewport.height * scale,
        }}
      >
        <iframe
          ref={iframeRef}
          src={canvasSrc}
          title="Page canvas"
          className="bg-background rounded-lg border shadow-sm"
          style={{
            width: viewport.width,
            height: viewport.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />

        {showHover && hover && (
          <Box
            rect={hover.rect}
            scale={scale}
            className="border-primary/40 border border-dashed"
          />
        )}

        {geometry && selectedElementKey && (
          <>
            <Box
              rect={geometry.rect}
              scale={scale}
              className="border-primary border-2"
            />
            <DragLayer
              element={geometry}
              elementKey={selectedElementKey}
              scale={scale}
            />
            <FloatingToolbar
              rect={geometry.rect}
              scale={scale}
              label={label ?? 'Element'}
              index={lastIndex}
            />
          </>
        )}
      </div>
    </div>
  )
}

/** An outline drawn over the scaled frame, in the frame's own coordinates. */
function Box({
  rect,
  scale,
  className,
  children,
}: {
  rect: CanvasElementInfo['rect']
  scale: number
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      // Pointer events off by default: an outline that swallows clicks would
      // make the element underneath it unselectable, which is the one thing the
      // outline exists to help with.
      className={cn('pointer-events-none absolute rounded-[3px]', className)}
      style={{
        left: rect.left * scale,
        top: rect.top * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The handles that move and resize the selected element.
 *
 * Every drag is converted out of screen pixels and into canvas pixels by
 * dividing by the frame's scale — a merchant dragging 40px across a frame drawn
 * at 60% has moved the element 67px, and reporting 40 would make the canvas
 * lag behind the pointer by more the further they dragged.
 *
 * What a drag *means* depends on how the element is positioned. In the flow it
 * nudges the element with a transform, which moves it visually without
 * disturbing anything around it. Free-positioned, it writes real `top`/`left`
 * against whatever the canvas reported as the offset parent.
 */
function DragLayer({
  element,
  elementKey,
  scale,
}: {
  element: CanvasElementInfo
  elementKey: string
  scale: number
}) {
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const setElementStyle = useBuilderStore((s) => s.setElementStyle)
  const sections = useBuilderStore((s) => s.sections)

  const bp = styleBreakpoint(breakpoint)
  const section = sections.find((s) => s.id === element.sectionId)
  const style = section?.config?.elements?.[elementKey]?.[bp] ?? {}
  const free = style.position === 'absolute'

  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    mode: 'move' | 'resize'
    origin: { x: number; y: number; width: number; height: number }
  } | null>(null)

  function begin(
    event: React.PointerEvent<HTMLDivElement>,
    mode: 'move' | 'resize'
  ) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode,
      origin: {
        // A free-positioned element's origin is its offset inside its
        // positioned ancestor, which is what `left`/`top` mean. In the flow it
        // is the nudge already applied, because that is what the drag adds to.
        x: free
          ? element.rect.left - element.parentRect.left
          : (style.offsetX ?? 0),
        y: free
          ? element.rect.top - element.parentRect.top
          : (style.offsetY ?? 0),
        width: element.rect.width,
        height: element.rect.height,
      },
    }
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    const dx = (event.clientX - state.startX) / scale
    const dy = (event.clientY - state.startY) / scale

    if (state.mode === 'move') {
      if (free) {
        setElementStyle(element.sectionId, elementKey, bp, {
          left: `${Math.round(state.origin.x + dx)}px`,
          top: `${Math.round(state.origin.y + dy)}px`,
        })
      } else {
        setElementStyle(element.sectionId, elementKey, bp, {
          offsetX: Math.round(state.origin.x + dx),
          offsetY: Math.round(state.origin.y + dy),
        })
      }
      return
    }

    setElementStyle(element.sectionId, elementKey, bp, {
      // Floored at a few pixels: an element dragged to zero disappears, and a
      // zero-sized element has no handle left to drag it back out by.
      width: `${Math.max(8, Math.round(state.origin.width + dx))}px`,
      height: `${Math.max(8, Math.round(state.origin.height + dy))}px`,
    })
  }

  function end(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const left = element.rect.left * scale
  const top = element.rect.top * scale
  const width = element.rect.width * scale
  const height = element.rect.height * scale

  return (
    <>
      {/* The move surface covers the element itself. It sits above the canvas,
          so a drag never reaches the page underneath and starts a text
          selection or follows a link. */}
      <div
        onPointerDown={(event) => begin(event, 'move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute cursor-move"
        style={{ left, top, width, height }}
        title={free ? 'Drag to position' : 'Drag to nudge'}
      />
      <div
        onPointerDown={(event) => begin(event, 'resize')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="border-primary bg-background absolute size-3 cursor-nwse-resize rounded-full border-2 shadow-sm"
        style={{ left: left + width - 6, top: top + height - 6 }}
        title="Drag to resize"
      />
    </>
  )
}

/** What an element key is called, for the label on the selection box. */
function elementLabel(
  section: { type: string; config?: { extras?: unknown } } | undefined,
  key: string
): string | null {
  if (!section) return null
  const { base } = parseElementKey(key)

  if (base.startsWith('x:')) {
    const extra = sectionExtras(section.config as never).find(
      (candidate) => `x:${candidate.id}` === base
    )
    return extra ? extraDescriptor(extra).label : 'Added element'
  }

  const definition = getSectionDefinition(section.type)
  return (
    definition?.elements.find((element) => element.key === base)?.label ?? base
  )
}
