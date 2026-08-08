'use client'

import { useEffect, useState } from 'react'
import {
  PageRenderer,
  type RenderablePageSection,
} from '@/modules/sections/PageRenderer'
import type { PageTheme } from '@/modules/sections/types'

export interface CanvasUpdateMessage {
  type: 'ncom:builder-update'
  theme: PageTheme
  sections: {
    id: string
    sectionKey: string
    content: unknown
    config: unknown
    isVisible: boolean
  }[]
}

export function CanvasClient({
  initialTheme,
  initialSections,
}: {
  initialTheme: PageTheme
  initialSections: RenderablePageSection[]
}) {
  const [theme, setTheme] = useState(initialTheme)
  const [sections, setSections] = useState(initialSections)

  useEffect(() => {
    function handleMessage(event: MessageEvent<CanvasUpdateMessage>) {
      if (event.data?.type !== 'ncom:builder-update') return

      setTheme(event.data.theme)
      setSections(
        event.data.sections.map((s) => ({
          id: s.id,
          order: 0,
          content: s.content,
          config: s.config,
          isVisible: s.isVisible,
          componentDefinition: { key: s.sectionKey },
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

  return <PageRenderer theme={theme} sections={sections} />
}
