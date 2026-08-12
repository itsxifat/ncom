'use client'

import { useActionState, useState } from 'react'
import {
  adjustInventoryAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field'
import { FormSelect } from '@/components/store/form-controls'

/**
 * Inline stock adjustment.
 *
 * Takes a signed delta ("+10", "-2") rather than a new absolute count, matching
 * the service. Two people receiving shipments at once should add 10 and add 5
 * and land on +15; two absolute writes would silently discard one of them.
 */
export function InventoryAdjust({
  variantId,
  locations,
}: {
  variantId: string
  locations: { id: string; name: string }[]
}) {
  const boundAction = adjustInventoryAction.bind(null)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )
  const [delta, setDelta] = useState('')

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2"
      onSubmit={() => setDelta('')}
    >
      <input type="hidden" name="variantId" value={variantId} />

      {locations.length > 1 ? (
        <FormSelect name="locationId" className="h-9 text-xs">
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </FormSelect>
      ) : (
        <input type="hidden" name="locationId" value={locations[0]?.id ?? ''} />
      )}

      <Input
        name="delta"
        value={delta}
        onChange={(event) => setDelta(event.target.value)}
        placeholder="+10"
        aria-label="Stock change"
        className="h-9 w-24"
        required
      />

      <FormSelect name="reason" className="h-9 text-xs" defaultValue="RECEIVED">
        <option value="RECEIVED">Received</option>
        <option value="MANUAL">Manual</option>
        <option value="CORRECTION">Correction</option>
        <option value="DAMAGED">Damaged</option>
        <option value="RESTOCK">Restock</option>
      </FormSelect>

      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? 'Saving…' : 'Apply'}
      </Button>

      {state?.error && <FieldError>{state.error}</FieldError>}
    </form>
  )
}
