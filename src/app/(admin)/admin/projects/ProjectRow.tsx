'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { forceUnpublishProjectAction } from './actions'

export function ProjectRow({
  projectId,
  name,
  subdomain,
  organizationName,
  pageCount,
}: {
  projectId: string
  name: string
  subdomain: string
  organizationName: string
  pageCount: number
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="text-muted-foreground truncate text-sm">
          {subdomain}.ncom.app · {organizationName} · {pageCount}{' '}
          {pageCount === 1 ? 'page' : 'pages'}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive shrink-0"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              `Unpublish every published page in "${name}"? Tenants can republish individually afterward.`
            )
          ) {
            return
          }
          startTransition(() => {
            forceUnpublishProjectAction(projectId)
          })
        }}
      >
        Force unpublish
      </Button>
    </div>
  )
}
