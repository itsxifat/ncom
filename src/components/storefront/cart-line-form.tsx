'use client'

import { useActionState } from 'react'
import {
  updateCartLineAction,
  type CartActionState,
} from '@/app/(public-site)/sites/[subdomain]/cart-actions'

/**
 * Quantity control for one cart line, with removal expressed as quantity zero
 * (matching updateCartLineSchema) so there is one code path for both.
 */
export function CartLineForm({
  subdomain,
  lineId,
  quantity,
}: {
  subdomain: string
  lineId: string
  quantity: number
}) {
  const action = updateCartLineAction.bind(null, subdomain)
  const [state, formAction, pending] = useActionState<
    CartActionState,
    FormData
  >(action, undefined)

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="lineId" value={lineId} />
      <input
        type="number"
        name="quantity"
        defaultValue={quantity}
        min={0}
        max={1000}
        aria-label="Quantity"
        className="w-20 rounded-[var(--page-radius)] border px-2 py-1"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-sm underline disabled:opacity-50"
      >
        {pending ? 'Updating…' : 'Update'}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs" style={{ color: '#dc2626' }}>
          {state.error}
        </span>
      )}
    </form>
  )
}
