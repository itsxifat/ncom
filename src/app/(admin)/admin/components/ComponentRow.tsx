'use client'

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{name}</span>
          <Badge variant="outline">{componentKey}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">{category}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Hidden'}
        </Badge>
        <Button
          type="button"
          variant="ghost"
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
      </div>
    </div>
  )
}
