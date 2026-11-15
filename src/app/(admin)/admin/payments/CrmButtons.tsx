'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { compareWithCrmAction, resendToCrmAction } from './actions'

/** Compares every invoice with the CRM now, instead of waiting for the six-hourly run. */
export function CompareButton() {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await compareWithCrmAction()
          if (result.ok) toast.success(result.message)
          else toast.error(result.message)
        })
      }
    >
      {pending ? 'Comparing…' : 'Compare now'}
    </Button>
  )
}

/** Sends one invoice again now (after finance fixed what held it). */
export function ResendButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await resendToCrmAction(id)
          toast.success('Sent again.')
        })
      }
    >
      {pending ? 'Sending…' : 'Send again'}
    </Button>
  )
}
