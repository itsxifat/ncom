'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from './store'
import { cn } from '@/lib/utils'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const BREAKPOINT_WIDTHS: Record<string, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
}

export function Canvas({
  canvasSrc,
  renderSection,
  serverRenderedIds,
  offersRevision = 0,
}: {
  canvasSrc: string
  /** Compiles a Liquid / custom-code section to HTML. */
  renderSection?: (input: {
    sectionId: string
    componentDefinitionId: string
    content: Record<string, unknown>
  }) => Promise<{ ok: true; html: string } | { ok: false; error: string }>
  /** ComponentDefinition ids whose sections must be compiled server-side. */
  serverRenderedIds?: Set<string>
  /**
   * Bumped whenever the page's offers or delivery rules change.
   *
   * Commerce sections read `offers` from the render scope rather than from
   * their own settings, so their HTML can go stale without any section content
   * changing — which is exactly what happened when a merchant created their
   * first offer and the bundle section carried on showing its empty state.
   */
  offersRevision?: number
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // A counter rather than a flag: the canvas announces itself on every load, so
  // a reloaded iframe has to be re-sent the sections it lost. With a boolean
  // the second announcement was a no-op state write, the post effect never
  // re-ran, and every server-compiled section came back blank.
  const [readyToken, setReadyToken] = useState(0)
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const sections = useBuilderStore((s) => s.sections)
  const theme = useBuilderStore((s) => s.theme)

  /**
   * Compiled HTML per section, keyed by section id.
   *
   * Cached against a fingerprint of the content so typing one character does
   * not re-compile every Liquid section on the page — only the one that
   * actually changed.
   */
  const [rendered, setRendered] = useState<Record<string, string>>({})
  const fingerprints = useRef<Record<string, string>>({})

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

  // Compile sections that need the server, debounced so a burst of keystrokes
  // results in one round trip rather than one per character.
  useEffect(() => {
    if (!renderSection || !serverRenderedIds?.size) return

    const pending = sections.filter((section) =>
      serverRenderedIds.has(section.componentDefinitionId)
    )
    if (pending.length === 0) return

    const timer = setTimeout(async () => {
      for (const section of pending) {
        // The revision is part of the fingerprint because a section's HTML
        // depends on more than its own settings: edit the offers and the same
        // content must compile to different markup.
        const fingerprint = `${offersRevision}:${JSON.stringify(section.content)}`
        if (fingerprints.current[section.id] === fingerprint) continue
        fingerprints.current[section.id] = fingerprint

        const result = await renderSection({
          sectionId: section.id,
          componentDefinitionId: section.componentDefinitionId,
          content: section.content,
        })

        setRendered((current) => ({
          ...current,
          [section.id]: result.ok
            ? result.html
            : // Shown in the builder only. The published storefront renders a
              // failed section as nothing rather than exposing an error.
              `<div style="padding:1rem;border:1px dashed #dc2626;color:#dc2626;font:13px ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(result.error)}</div>`,
        }))
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [sections, renderSection, serverRenderedIds, offersRevision])

  /**
   * React commerce sections (the order form) are handed their offers by the
   * canvas route on the server, not over postMessage, so the only way to
   * refresh them is to load the route again. Skipped on mount — the iframe has
   * just fetched the current offers by definition.
   */
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
          sectionKey: s.sectionKey,
          content: s.content,
          config: s.config,
          isVisible: s.isVisible,
          // Present only for server-compiled sections; the canvas renders it
          // verbatim instead of looking the type up in the React registry.
          html: serverRenderedIds?.has(s.componentDefinitionId)
            ? (rendered[s.id] ?? '')
            : undefined,
        })),
      },
      window.location.origin
    )
  }, [readyToken, sections, theme, rendered, serverRenderedIds])

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
