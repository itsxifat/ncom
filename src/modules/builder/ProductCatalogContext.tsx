'use client'

import { createContext, useContext } from 'react'
import type { PickerProduct } from '@/server/services/productService'

/**
 * The store's catalogue, made available to the Inspector.
 *
 * Passed by context rather than threaded as props because only one field type
 * needs it and it would otherwise have to travel through four components that
 * have no interest in the catalogue (BuilderShell → InspectorPanel →
 * SectionInspectorForm → FieldRenderer, and again through every nested array
 * item). The default is empty so the template builder — which edits designs
 * with no store behind them — renders the field disabled instead of crashing.
 *
 * Carries both shapes. `variants` is the flat pick-one list a section stores;
 * `products` is what the picker *shows*, with photos, prices and stock, because
 * a merchant cannot choose between two similarly-named products from a title
 * alone.
 */
export interface SellableVariant {
  variantId: string
  /** "Product title — Variant title", ready to show in a picker. */
  label: string
  priceCents: number
  currencyCode: string
}

export interface ProductCatalog {
  variants: SellableVariant[]
  products: PickerProduct[]
  /**
   * Where the picker's next page of `products` starts. The catalogue can be
   * bigger than one page — most are — and without this the inspector could
   * only ever offer the first sixty products of a shop.
   */
  cursor: string | null
  currencyCode: string
}

const EMPTY: ProductCatalog = {
  variants: [],
  products: [],
  cursor: null,
  currencyCode: 'USD',
}

const ProductCatalogContext = createContext<ProductCatalog>(EMPTY)

export function ProductCatalogProvider({
  variants,
  products,
  cursor,
  currencyCode,
  children,
}: {
  variants: SellableVariant[]
  products?: PickerProduct[]
  cursor?: string | null
  currencyCode?: string
  children: React.ReactNode
}) {
  return (
    <ProductCatalogContext
      value={{
        variants,
        products: products ?? [],
        cursor: cursor ?? null,
        currencyCode: currencyCode ?? variants[0]?.currencyCode ?? 'USD',
      }}
    >
      {children}
    </ProductCatalogContext>
  )
}

export function useProductCatalog(): ProductCatalog {
  return useContext(ProductCatalogContext)
}
