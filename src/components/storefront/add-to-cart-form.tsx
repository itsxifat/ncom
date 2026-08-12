'use client'

import { useActionState, useState } from 'react'
import {
  addToCartAction,
  type CartActionState,
} from '@/app/(public-site)/sites/[subdomain]/cart-actions'

interface VariantOption {
  id: string
  title: string
  priceCents: number
  available: boolean
}

/**
 * Default add-to-cart control, used when a store has not published its own
 * Liquid product template.
 *
 * The variant list is a native <select> inside a <form> so the control works
 * before hydration — a storefront's single most important interaction should
 * not depend on JavaScript having loaded. This is the one place that keeps the
 * browser's own picker rather than the app's `FormSelect`, which is a scripted
 * listbox and therefore inert until React arrives. `color-scheme` on the
 * storefront root is what keeps its popup legible on a dark theme.
 */
export function AddToCartForm({
  subdomain,
  variants,
  formatPrice,
}: {
  subdomain: string
  variants: VariantOption[]
  formatPrice: (cents: number) => string
}) {
  const action = addToCartAction.bind(null, subdomain)
  const [state, formAction, pending] = useActionState<
    CartActionState,
    FormData
  >(action, undefined)
  const [selectedId, setSelectedId] = useState(
    variants.find((variant) => variant.available)?.id ?? variants[0]?.id ?? ''
  )

  const selected = variants.find((variant) => variant.id === selectedId)
  const soldOut = selected ? !selected.available : true

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {variants.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Option</span>
          <select
            name="variantId"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="rounded-[var(--page-radius)] border bg-transparent px-3 py-2"
          >
            {variants.map((variant) => (
              <option
                key={variant.id}
                value={variant.id}
                disabled={!variant.available}
              >
                {variant.title} — {formatPrice(variant.priceCents)}
                {variant.available ? '' : ' (sold out)'}
              </option>
            ))}
          </select>
        </label>
      )}

      {variants.length <= 1 && (
        <input type="hidden" name="variantId" value={selectedId} />
      )}

      <label className="flex w-28 flex-col gap-1 text-sm">
        <span className="opacity-70">Quantity</span>
        <input
          type="number"
          name="quantity"
          defaultValue={1}
          min={1}
          max={1000}
          className="rounded-[var(--page-radius)] border px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending || soldOut}
        className="rounded-[var(--page-radius)] px-6 py-3 font-medium disabled:opacity-50"
        style={{
          backgroundColor: 'var(--page-primary)',
          color: 'var(--page-background)',
        }}
      >
        {soldOut ? 'Sold out' : pending ? 'Adding…' : 'Add to cart'}
      </button>

      {state?.error && (
        <p role="alert" className="text-sm" style={{ color: '#dc2626' }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm opacity-70">
          Added to your cart.
        </p>
      )}
    </form>
  )
}
