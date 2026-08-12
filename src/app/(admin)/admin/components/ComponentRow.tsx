'use client'

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { toggleComponentDefinitionActiveAction } from './actions'

export function ComponentRow({
  id,
  componentKey,
  name,
  category,
  isActive,
}: {
  id: string
  componentKey: string
  name: string
  category: string
  isActive: boolean
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <ListRow>
      <ListRowText
        title={name}
        meta={
          <span className="font-mono text-xs">
            {componentKey} · {category}
          </span>
        }
        badges={
          <Badge variant={isActive ? 'lime' : 'secondary'}>
            {isActive ? 'Active' : 'Hidden'}
          </Badge>
        }
      />
      <ListRowActions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => {
            startTransition(() => {
              toggleComponentDefinitionActiveAction(id)
            })
          }}
        >
          {isActive ? 'Hide' : 'Unhide'}
        </Button>
      </ListRowActions>
    </ListRow>
  )
}
