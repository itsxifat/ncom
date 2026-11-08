'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { payOrderAction } from './actions'

/**
 * Pays an order still waiting for payment, on Enfinito Pay. The page is left
 * for the payment page by a full navigation — it is another site — and comes
 * back to /billing/payment/return when the owner is done.
 */
export function PayOrderButton({
  kind,
  orderId,
}: {
  kind: 'plan' | 'credits'
  orderId: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await payOrderAction(kind, orderId)
          if ('error' in result) {
            toast.error(result.error)
            return
          }
          window.location.assign(result.url)
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}
      Pay now
    </Button>
  )
}
