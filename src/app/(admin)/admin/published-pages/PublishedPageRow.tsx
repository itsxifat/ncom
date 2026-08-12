'use client'

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
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
    <ListRow>
      <ListRowText
        title={title}
        meta={`${url} · ${organizationName}${
          publishedAt
            ? ` · published ${new Date(publishedAt).toLocaleDateString()}`
            : ''
        }`}
        badges={<Badge variant="lime">Live</Badge>}
      />
      <ListRowActions>
        <Button
          type="button"
          variant="destructive"
          size="sm"
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
      </ListRowActions>
    </ListRow>
  )
}
