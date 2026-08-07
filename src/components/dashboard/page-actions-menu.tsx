'use client'

import { useTransition } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { deletePageAction } from '@/app/(dashboard)/projects/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function PageActionsMenu({
  projectId,
  pageId,
}: {
  projectId: string
  pageId: string
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" disabled={isPending} />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            if (!window.confirm('Delete this page? This cannot be undone.')) {
              return
            }
            startTransition(() => {
              deletePageAction(projectId, pageId)
            })
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
