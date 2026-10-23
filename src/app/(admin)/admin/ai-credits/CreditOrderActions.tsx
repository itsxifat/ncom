'use client'

import { useTransition } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cancelCreditOrderAction, markCreditOrderPaidAction } from './actions'

/**
 * "Mark paid" and "Cancel" for a credit order waiting on payment — on the AI
 * credits page and on the workspace's own admin page.
 */
export function CreditOrderActions({
  orderId,
  label,
}: {
  orderId: string
  /** What is being paid for, for the confirmation. */
  label: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => {
          const reference = window.prompt(
            `Mark “${label}” as paid and add the credits?\n\nPayment reference (bKash transaction ID, bank reference) — optional:`,
            ''
          )
          if (reference === null) return
          startTransition(async () => {
            const result = await markCreditOrderPaidAction(orderId, {
              reference,
            })
            if (result.error) toast.error(result.error)
            else toast.success('Paid — the credits are on the workspace')
          })
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
        Mark paid
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Cancel the order for “${label}”?`)) return
          startTransition(async () => {
            const result = await cancelCreditOrderAction(orderId)
            if (result.error) toast.error(result.error)
            else toast.success('Order cancelled')
          })
        }}
      >
        <X />
        Cancel
      </Button>
    </div>
  )
}
