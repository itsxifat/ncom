'use client'

import { useTransition } from 'react'
import { deleteTemplateAction } from './actions'
import { Button } from '@/components/ui/button'

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      className="text-destructive hover:bg-destructive/10"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm('Delete this template? This cannot be undone.')) {
          return
        }
        startTransition(() => {
          deleteTemplateAction(templateId)
        })
      }}
    >
      {isPending ? 'Deleting…' : 'Delete template'}
    </Button>
  )
}
