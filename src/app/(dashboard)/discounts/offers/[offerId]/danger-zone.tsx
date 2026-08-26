'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteOfferAction } from '@/app/(dashboard)/discounts/offer-actions'
import { Button } from '@/components/ui/button'
import { SettingsSection } from '@/components/app/settings-section'

/**
 * Deleting an offer.
 *
 * Behind a confirm because orders record the offer's *key*, and while deleting
 * one cannot corrupt an order — the label and prices were copied at the time of
 * sale — it does break any ad still pointing at it. Pausing is the reversible
 * move and is one switch up the page.
 */
export function OfferDangerZone({
  offerId,
  label,
}: {
  offerId: string
  label: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <SettingsSection
      title="Delete this offer"
      description="Any ad or link pointing at it stops working. Placed orders keep the price they were sold at."
    >
      <div className="flex flex-col items-start gap-3">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">
              Delete <span className="font-medium">{label}</span>?
            </p>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteOfferAction(offerId)
                  if (result?.error) {
                    setError(result.error)
                    setConfirming(false)
                    return
                  }
                  router.push('/discounts/offers')
                })
              }
            >
              {pending ? 'Deleting…' : 'Yes, delete it'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
            Delete offer
          </Button>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    </SettingsSection>
  )
}
