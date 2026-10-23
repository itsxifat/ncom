'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { El } from '@/modules/sections/elements'
import { useCart } from './CartProvider'

/**
 * The button under a product card.
 *
 * Adds straight to the cart only when there is nothing to choose — one
 * variant, in stock. A product with sizes sends the shopper to its page
 * instead, because picking a size for them is how a store ships the wrong one.
 * Outside a live store (the builder, a preview) it draws exactly the same and
 * does nothing, so the merchant sees the real card.
 */
export function QuickAddButton({
  part,
  index,
  className,
  variantId,
  productId,
  productHref,
  available,
  addLabel,
  chooseLabel,
  soldOutLabel,
}: {
  part: string
  index: number
  className?: string
  variantId: string | null
  productId: string
  productHref: string
  available: boolean
  addLabel: string
  chooseLabel: string
  soldOutLabel: string
}) {
  const cart = useCart()
  const [adding, setAdding] = useState(false)

  if (!available) {
    return (
      <El
        as="span"
        part={part}
        index={index}
        aria-disabled
        className={`${className ?? ''} pointer-events-none opacity-50`}
      >
        {soldOutLabel}
      </El>
    )
  }

  if (!variantId) {
    return (
      <El
        as="a"
        part={part}
        index={index}
        href={productHref}
        className={className}
      >
        {chooseLabel}
      </El>
    )
  }

  return (
    <El
      as="button"
      part={part}
      index={index}
      type="button"
      disabled={adding}
      onClick={async () => {
        if (!cart) return
        setAdding(true)
        await cart.add({ variantId, productId, quantity: 1 })
        setAdding(false)
      }}
      className={className}
    >
      {adding ? <Loader2 className="size-4 animate-spin" /> : addLabel}
    </El>
  )
}
