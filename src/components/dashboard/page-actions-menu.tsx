'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  deletePageAction,
  publishPageAction,
  unpublishPageAction,
} from '@/app/(dashboard)/projects/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function PageActionsMenu({
  projectId,
  pageId,
  status,
  previewToken,
}: {
  projectId: string
  pageId: string
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED'
  previewToken: string
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
          render={
            <Link href={`/projects/${projectId}/pages/${pageId}/settings`} />
          }
        >
          Page settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            startTransition(() => {
              publishPageAction(projectId, pageId)
            })
          }}
        >
          {status === 'PUBLISHED' ? 'Publish changes' : 'Publish'}
        </DropdownMenuItem>
        {status === 'PUBLISHED' && (
          <DropdownMenuItem
            onClick={() => {
              startTransition(() => {
                unpublishPageAction(projectId, pageId)
              })
            }}
          >
            Unpublish
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(
              `${window.location.origin}/preview/${previewToken}`
            )
            toast.success('Preview link copied')
          }}
        >
          Copy preview link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
