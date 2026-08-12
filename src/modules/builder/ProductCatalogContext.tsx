'use client'

import { createContext, useContext } from 'react'

/**
 * The store's sellable variants, made available to the Inspector.
 *
 * Passed by context rather than threaded as props because only one field type
 * needs it and it would otherwise have to travel through four components that
 * have no interest in the catalogue (BuilderShell → InspectorPanel →
 * SectionInspectorForm → FieldRenderer, and again through every nested array
 * item). The default is an empty list so the template builder — which edits
 * designs with no store behind them — renders the field disabled instead of
 * crashing.
 */
export interface SellableVariant {
  variantId: string
  /** "Product title — Variant title", ready to show in a picker. */
  label: string
  priceCents: number
  currencyCode: string
}

const ProductCatalogContext = createContext<SellableVariant[]>([])

export function ProductCatalogProvider({
  variants,
  children,
}: {
  variants: SellableVariant[]
  children: React.ReactNode
}) {
  return (
    <ProductCatalogContext value={variants}>{children}</ProductCatalogContext>
  )
}

export function useProductCatalog(): SellableVariant[] {
  return useContext(ProductCatalogContext)
}
