'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { deletePlanAction } from './actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function PlanRowActions({
  planId,
  planName,
}: {
  planId: string
  planName: string
}) {
  const [isPending, startTransition] = useTransition()
  // Deleting a plan fails for good reasons (someone is on it, it is the default)
  // and the reason is the useful part, so it is shown rather than swallowed.
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              title="Plan actions"
              disabled={isPending}
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<Link href={`/admin/plans/${planId}`} />}
            nativeButton={false}
          >
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (!window.confirm(`Delete the ${planName} plan?`)) return
              startTransition(async () => {
                const result = await deletePlanAction(planId)
                setError(result.error ?? null)
              })
            }}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p className="text-destructive max-w-64 text-right text-xs">{error}</p>
      )}
    </div>
  )
}
