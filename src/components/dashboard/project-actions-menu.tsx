'use client'

import { useTransition } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  deleteProjectAction,
  duplicateProjectAction,
} from '@/app/(dashboard)/projects/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ProjectActionsMenu({ projectId }: { projectId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={(e) => e.preventDefault()}
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            startTransition(() => {
              duplicateProjectAction(projectId)
            })
          }}
        >
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            if (
              !window.confirm('Delete this project? This cannot be undone.')
            ) {
              return
            }
            startTransition(() => {
              deleteProjectAction(projectId)
            })
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
