'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { forceUnpublishPageAction } from './actions'

export function PublishedPageRow({
  pageId,
  title,
  url,
  organizationName,
  publishedAt,
}: {
  pageId: string
  title: string
  url: string
  organizationName: string
  publishedAt: string | null
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="text-muted-foreground truncate text-sm">
          {url} · {organizationName}
          {publishedAt &&
            ` · published ${new Date(publishedAt).toLocaleDateString()}`}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive shrink-0"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm(`Force-unpublish "${title}"?`)) return
          startTransition(() => {
            forceUnpublishPageAction(pageId)
          })
        }}
      >
        Force unpublish
      </Button>
    </div>
  )
}
