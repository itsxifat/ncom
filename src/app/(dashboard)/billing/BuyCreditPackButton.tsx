'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { orderCreditPackAction } from './actions'

export function BuyCreditPackButton({
  packId,
  disabled,
}: {
  packId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      className="w-full"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await orderCreditPackAction(packId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          // Paid on Enfinito Pay, another site: a full navigation, and back
          // to /billing/payment/return when the owner is done.
          if (result.payUrl) {
            window.location.assign(result.payUrl)
            return
          }
          toast.success(
            result.paid ? 'Credits added' : 'We’ve recorded your order',
            {
              description: result.paid
                ? 'They’re ready to use in the AI builder.'
                : 'Online payment isn’t open yet, so our team will contact you to finish it. Your credits are added as soon as it’s paid.',
            }
          )
          router.refresh()
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      Buy
    </Button>
  )
}
