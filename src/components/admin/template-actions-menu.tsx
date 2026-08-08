'use client'

import { useTransition } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { deleteTemplateAction } from '@/app/(admin)/admin/templates/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function TemplateActionsMenu({ templateId }: { templateId: string }) {
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
          variant="destructive"
          onClick={() => {
            if (
              !window.confirm('Delete this template? This cannot be undone.')
            ) {
              return
            }
            startTransition(() => {
              deleteTemplateAction(templateId)
            })
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
