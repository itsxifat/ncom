'use client'

import { useEffect, useState } from 'react'
import {
  PageRenderer,
  type RenderablePageSection,
} from '@/modules/sections/PageRenderer'
import type { PageTheme } from '@/modules/sections/types'
import type { StorefrontCommerce } from '@/modules/sections/registry'

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

  useEffect(() => {
    function handleMessage(event: MessageEvent<CanvasUpdateMessage>) {
      // Only the builder shell, on this same origin, may drive the canvas.
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'ncom:builder-update') return

      setTheme(event.data.theme)
      setSections(
        event.data.sections.map((s) => ({
          id: s.id,
          order: 0,
          type: s.type,
          content: s.content,
          config: s.config,
          isVisible: s.isVisible,
        }))
      )
    }

    window.addEventListener('message', handleMessage)
    // Tell the parent we're ready to receive updates.
    window.parent.postMessage(
      { type: 'ncom:canvas-ready' },
      window.location.origin
    )
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <PageRenderer
      theme={theme}
      sections={sections}
      commerce={commerce}
      editing
    />
  )
}
