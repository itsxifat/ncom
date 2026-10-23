'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { History, Loader2, RotateCcw } from 'lucide-react'
import type { SectionConfig } from '../sections/types'
import {
  isLayoutSection,
  undoEdit,
  useBuilderStore,
  type BuilderSection,
} from './store'
import { useBuilderSite } from './SiteContext'
import { getPageVersionAction, listPageVersionsAction } from './history-actions'
import type { PageVersionSummary } from '@/server/services/pageVersionService'
import { REPORTING_TIMEZONE } from '@/lib/date-range'
import { TONE_STYLES } from '@/lib/order-status-colors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Every version of this page that went live, and a way back to any of them.
 *
 * Publishing already keeps a copy of the page each time (see `publishPage`);
 * this is the merchant's window onto those copies. A merchant who rewrote the
 * hero on Friday and sold less all weekend should be able to put Thursday's
 * page back in two clicks, not rebuild it from memory.
 *
 * Restoring changes the draft, never the live site: the version's blocks
 * replace the page's blocks in the builder as one edit — undone by Undo like
 * any other — and go live when the merchant publishes. Only the page's own
 * blocks come back. The look is the site's and the header and footer are
 * every page's, so bringing back one page's old copy of them would quietly
 * change all the others.
 */
export function HistoryPanel() {
  const site = useBuilderSite()
  const aiBusy = useBuilderStore((s) => s.aiRequest !== null)
  const [versions, setVersions] = useState<PageVersionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<PageVersionSummary | null>(null)
  const [restoring, startRestore] = useTransition()

  const storeId = site?.storeId
  const pageId = site?.pageId

  useEffect(() => {
    if (!storeId || !pageId) return
    let cancelled = false
    listPageVersionsAction(storeId, pageId)
      .then((result) => {
        if (cancelled) return
        if (result.ok) setVersions(result.versions)
        else setError(result.error)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this page’s history.')
      })
    return () => {
      cancelled = true
    }
  }, [storeId, pageId])

  if (!site) return null

  function restore(version: PageVersionSummary) {
    startRestore(async () => {
      const result = await getPageVersionAction(
        site!.storeId,
        site!.pageId,
        version.id
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const { sections, replaceSections } = useBuilderStore.getState()
      // The store's layout keeps its pinned places: whatever leads the list
      // stays on top, whatever ends it stays at the bottom.
      let start = 0
      while (start < sections.length && isLayoutSection(sections[start]!))
        start++
      let end = sections.length
      while (end > start && isLayoutSection(sections[end - 1]!)) end--
      const restored: BuilderSection[] = result.sections.map((section) => ({
        id: section.id,
        type: section.type,
        order: section.order,
        content: section.content,
        config: section.config as SectionConfig,
        isVisible: section.isVisible,
      }))
      replaceSections([
        ...sections.slice(0, start),
        ...restored,
        ...sections.slice(end),
      ])
      setConfirming(null)
      toast.success(`Brought back the page from ${when(version.publishedAt)}`, {
        description: 'Publish to put it live. Undo brings back what you had.',
        action: { label: 'Undo', onClick: undoEdit },
      })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Each time you publish, a copy of this page is kept here. Bring one back
        to undo changes you regret — it becomes your draft, and goes live when
        you publish.
      </p>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : versions === null ? (
        <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading history…
        </div>
      ) : versions.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          <History className="size-5" />
          <p>
            Nothing published yet. When you publish this page, its copy appears
            here.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-1">
          {versions.map((version) => (
            <li
              key={version.id}
              className={cn(
                'flex items-start gap-3 rounded-lg px-2 py-2.5',
                version.live && 'bg-muted/60'
              )}
            >
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  version.live ? TONE_STYLES.green.swatch : 'bg-border'
                )}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-sm font-medium">
                    {version.label ?? `Published ${when(version.publishedAt)}`}
                  </span>
                  {version.live && (
                    <Badge className={cn('h-5', TONE_STYLES.green.pill)}>
                      Live now
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {[
                    version.label
                      ? `Published ${when(version.publishedAt)}`
                      : null,
                    version.publishedBy,
                    version.sectionCount === 1
                      ? '1 block'
                      : `${version.sectionCount} blocks`,
                    version.publishCount > 1
                      ? `published ${version.publishCount} times`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={restoring || aiBusy}
                title={
                  aiBusy
                    ? 'Wait for the AI to finish with this page first'
                    : 'Make this version your draft'
                }
                onClick={() => setConfirming(version)}
              >
                <RotateCcw />
                Restore
              </Button>
            </li>
          ))}
        </ol>
      )}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) setConfirming(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bring back this version?</DialogTitle>
            <DialogDescription>
              This page’s blocks go back to how they were when it was published{' '}
              {confirming ? when(confirming.publishedAt) : ''}. Your colours,
              fonts{site.kind === 'STORE' ? ', header and footer' : ''} stay as
              they are now. Nothing changes for visitors until you publish, and
              Undo brings back your current draft.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={restoring}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={restoring || !confirming}
              onClick={() => confirming && restore(confirming)}
            >
              {restoring ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Bring it back
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * "12 min ago", "3 hr ago", then the day and time in Dhaka — the clock the
 * merchant was looking at when they pressed Publish.
 */
function when(iso: string): string {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORTING_TIMEZONE,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(then)
}
