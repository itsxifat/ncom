'use client'

import { ArrowRight, Rocket, TriangleAlert } from 'lucide-react'
import type { PublishIssue } from './publishChecks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * "Before you publish": what `publishChecks` found, each with a way to the
 * block it is about.
 *
 * Fixing comes first — it is the default button, because the list exists so
 * a page goes live finished — but publishing anyway is one click away. The
 * merchant may know that the countdown is meant to say the sale is over.
 */
export function PublishCheckDialog({
  issues,
  onClose,
  onShow,
  onPublishAnyway,
  firstPublish,
}: {
  /** Null when the dialog is closed. */
  issues: PublishIssue[] | null
  onClose: () => void
  /** Selects and scrolls to a block, after closing the dialog. */
  onShow: (sectionId: string) => void
  onPublishAnyway: () => void
  /** Whether the site has never been live, for the wording. */
  firstPublish: boolean
}) {
  const count = issues?.length ?? 0
  return (
    <Dialog
      open={issues !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Before you publish</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'One thing on this page looks unfinished. Fix it first, or publish anyway.'
              : `${count} things on this page look unfinished. Fix them first, or publish anyway.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="-mx-1 flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-1">
          {issues?.map((issue) => (
            <li
              key={issue.key}
              className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed break-words">
                  {issue.detail}
                </p>
              </div>
              {issue.sectionId && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => onShow(issue.sectionId!)}
                >
                  Show me
                  <ArrowRight />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onPublishAnyway}>
            <Rocket />
            {firstPublish ? 'Publish anyway' : 'Publish changes anyway'}
          </Button>
          <Button type="button" onClick={onClose}>
            Keep editing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
