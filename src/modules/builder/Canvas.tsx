'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from './store'
import { cn } from '@/lib/utils'

const BREAKPOINT_WIDTHS: Record<string, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
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
  // A counter rather than a flag: the canvas announces itself on every load, so
  // a reloaded iframe has to be re-sent the sections it lost. With a boolean
  // the second announcement was a no-op state write and the post effect never
  // re-ran.
  const [readyToken, setReadyToken] = useState(0)
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const sections = useBuilderStore((s) => s.sections)
  const theme = useBuilderStore((s) => s.theme)

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

  return (
    <div className="bg-muted flex h-full items-start justify-center overflow-auto p-6">
      <iframe
        ref={iframeRef}
        src={canvasSrc}
        title="Page canvas"
        className={cn(
          'bg-background h-full rounded-lg border shadow-sm transition-[width] duration-200',
          breakpoint === 'desktop' && 'w-full max-w-full'
        )}
        style={
          breakpoint === 'desktop'
            ? undefined
            : { width: BREAKPOINT_WIDTHS[breakpoint], maxWidth: '100%' }
        }
      />
    </div>
  )
}
