'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from './store'
import { cn } from '@/lib/utils'

const BREAKPOINT_WIDTHS: Record<string, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
}

export function Canvas({ pageId }: { pageId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const sections = useBuilderStore((s) => s.sections)
  const theme = useBuilderStore((s) => s.theme)

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'ncom:canvas-ready') {
        setCanvasReady(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    if (!canvasReady || !theme) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'ncom:builder-update',
        theme,
        sections: sections.map((s) => ({
          id: s.id,
          sectionKey: s.sectionKey,
          content: s.content,
          config: s.config,
          isVisible: s.isVisible,
        })),
      },
      window.location.origin
    )
  }, [canvasReady, sections, theme])

  return (
    <div className="bg-muted flex h-full items-start justify-center overflow-auto p-6">
      <iframe
        ref={iframeRef}
        src={`/builder-canvas/${pageId}`}
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
