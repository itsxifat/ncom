'use client'

import { useState, useTransition } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import {
  archiveProductAction,
  deleteProductAction,
} from '@/app/(dashboard)/commerce-actions'
import { Button } from '@/components/ui/button'
import { SettingsSection } from '@/components/app/settings-section'
import { FieldError } from '@/components/ui/field'

/**
 * Archive and delete.
 *
 * Archive is offered first and framed as the normal action, because it is: a
 * product that has ever sold cannot be deleted (the service refuses), and
 * merchants reaching for "delete" almost always mean "stop showing this".
 * Delete asks for confirmation because it cannot be undone.
 */
export function ProductDangerZone({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  return (
    <SettingsSection
      title="Danger zone"
      description="Archiving hides the product from your storefront but keeps its order history."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await archiveProductAction(productId)
                setError(result?.error ?? null)
              })
            }
          >
            <Archive />
            Archive product
          </Button>

          {confirming ? (
            <>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteProductAction(productId)
                    // A successful delete redirects, so reaching here at all
                    // means it was refused.
                    setError(result?.error ?? null)
                    setConfirming(false)
                  })
                }
              >
                {pending ? 'Deleting…' : 'Yes, delete permanently'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>

        {error && <FieldError>{error}</FieldError>}
      </div>
    </SettingsSection>
  )
}
