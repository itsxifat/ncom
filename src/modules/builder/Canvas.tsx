'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore, type Breakpoint } from './store'

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
 * The live preview.
 *
 * The page renders inside a same-origin iframe and the editor posts it the
 * current draft; the iframe resolves each block through the same registry the
 * published page uses, so what a merchant arranges is literally what a customer
 * sees. Nothing is compiled on the server on the way — every block is a React
 * component, so the draft travels as plain JSON and renders in one hop.
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
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const sections = useBuilderStore((s) => s.sections)
  const theme = useBuilderStore((s) => s.theme)

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
    function handleMessage(event: MessageEvent) {
      // The canvas is same-origin; anything else posting here is not ours.
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'ncom:canvas-ready') {
        setReadyToken((token) => token + 1)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

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
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'ncom:builder-update',
        theme,
        sections: sections.map((s) => ({
          id: s.id,
          type: s.type,
          content: s.content,
          config: s.config,
          isVisible: s.isVisible,
        })),
      },
      window.location.origin
    )
  }, [readyToken, sections, theme])

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

  return (
    <div ref={shellRef} className="bg-muted h-full overflow-auto p-6">
      {/*
        A transform does not affect layout, so this wrapper carries the frame's
        post-scale size. Without it, centring and the scroll extent would both be
        computed from the unscaled 1440px and the frame would sit off to one side.
      */}
      <div
        className="mx-auto"
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
      </div>
    </div>
  )
}
