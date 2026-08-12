'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { forceUnpublishStoreAction } from './actions'

export function StoreRow({
  storeId,
  name,
  subdomain,
  rootDomain,
  organizationName,
  pageCount,
}: {
  storeId: string
  name: string
  subdomain: string
  /** `env.ROOT_DOMAIN`, passed in because `env` is server-only. */
  rootDomain: string
  organizationName: string
  pageCount: number
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <ListRow>
      <ListRowText
        title={name}
        meta={`${subdomain}.${rootDomain} · ${organizationName}`}
        badges={
          <Badge variant="secondary">
            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </Badge>
        }
      />
      <ListRowActions>
        <Button
          type="button"
          variant="destructive"
          size="sm"
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
              forceUnpublishStoreAction(storeId)
            })
          }}
        >
          Force unpublish
        </Button>
      </ListRowActions>
    </ListRow>
  )
}
