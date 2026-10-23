'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/ui/form-select'
import { ProductPickerDialog } from '@/components/store/product-picker'
import type { PickerProduct } from '@/server/services/productService'
import { useProductCatalog } from './ProductCatalogContext'
import { pagePath, useBuilderSite } from './SiteContext'

/**
 * The inspector controls for things that live elsewhere on the site.
 *
 * Every one of them is a choice from a list the merchant already made — their
 * pages, their categories, their products — rather than a box to type an id
 * or an address into. A non-technical merchant knows they want the button to
 * go to "Bags"; they do not know, and should never need to know, that bags
 * live at `/categories/bags`.
 */

const CUSTOM = '__custom__'
const NONE = '__none__'

interface LinkChoice {
  value: string
  label: string
  group: string
}

function linkChoices(site: ReturnType<typeof useBuilderSite>): LinkChoice[] {
  if (!site) return []
  const choices: LinkChoice[] = []

  for (const page of site.pages) {
    if (page.role !== 'STANDARD') continue
    choices.push({
      value: pagePath(page),
      label: page.isHome ? 'Home page' : page.title,
      group: 'Pages',
    })
  }

  if (site.kind === 'STORE') {
    choices.push(
      { value: '/products', label: 'All products', group: 'Shop' },
      { value: '/search', label: 'Search', group: 'Shop' },
      { value: '/cart', label: 'Cart', group: 'Shop' },
      { value: '/account', label: 'Customer account', group: 'Shop' }
    )
    for (const category of site.categories) {
      choices.push({
        value: `/categories/${category.handle}`,
        label: category.name,
        group: 'Categories',
      })
    }
    for (const collection of site.collections) {
      choices.push({
        value: `/collections/${collection.handle}`,
        label: collection.title,
        group: 'Collections',
      })
    }
  } else {
    choices.push({
      value: '#order',
      label: 'The order form on this page',
      group: 'On this page',
    })
  }

  return choices
}

export function LinkFieldControl({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const site = useBuilderSite()
  const choices = linkChoices(site)
  const known = value === '' || choices.some((choice) => choice.value === value)
  // Custom stays open once chosen, even before anything is typed — otherwise
  // picking "Custom address" with an empty value would snap straight back to
  // the first option and the box to type in would never appear.
  const [custom, setCustom] = useState(!known && value !== '')
  const showCustom = custom || !known

  const groups = [...new Set(choices.map((choice) => choice.group))]

  return (
    <div className="flex flex-col gap-2">
      <FormSelect
        value={showCustom ? CUSTOM : value || NONE}
        onChange={(event) => {
          if (event.target.value === CUSTOM) {
            setCustom(true)
            return
          }
          setCustom(false)
          onChange(event.target.value === NONE ? '' : event.target.value)
        }}
      >
        <option value={NONE}>No link</option>
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {choices
              .filter((choice) => choice.group === group)
              .map((choice) => (
                <option key={`${group}:${choice.value}`} value={choice.value}>
                  {choice.label}
                </option>
              ))}
          </optgroup>
        ))}
        <optgroup label="Elsewhere">
          <option value={CUSTOM}>A web address…</option>
        </optgroup>
      </FormSelect>
      {showCustom && (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? 'https://… or /page'}
          autoFocus={custom && value === ''}
        />
      )}
    </div>
  )
}

export function CategoryFieldControl({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const site = useBuilderSite()
  const categories = site?.categories ?? []

  if (categories.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No categories yet. Add them under Products → Categories, then choose one
        here.
      </p>
    )
  }

  // Indented by depth so "Women › Dresses" reads as the tree it is.
  const depth = (id: string | null, seen = 0): number => {
    const parent = categories.find((category) => category.id === id)?.parentId
    return parent && seen < 3 ? 1 + depth(parent, seen + 1) : 0
  }

  return (
    <FormSelect
      value={value}
      placeholder="Choose a category"
      onChange={(event) => onChange(event.target.value)}
    >
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {`${'— '.repeat(depth(category.id))}${category.name}`}
        </option>
      ))}
    </FormSelect>
  )
}

export function CollectionFieldControl({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const site = useBuilderSite()
  const collections = site?.collections ?? []

  if (collections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No collections yet. Make one under Products → Collections — “Best
        sellers”, “New in” — then choose it here.
      </p>
    )
  }

  return (
    <FormSelect
      value={value}
      placeholder="Choose a collection"
      onChange={(event) => onChange(event.target.value)}
    >
      {collections.map((collection) => (
        <option key={collection.id} value={collection.id}>
          {collection.title}
        </option>
      ))}
    </FormSelect>
  )
}

/**
 * A short, ordered list of products picked by hand.
 *
 * Shown as the products themselves — photo and name — rather than a list of
 * ids, with arrows to reorder, because the order is the merchant's whole
 * reason for picking by hand instead of showing a category.
 */
export function ProductsFieldControl({
  value,
  onChange,
  max = 12,
}: {
  value: string[]
  onChange: (value: string[]) => void
  max?: number
}) {
  const catalog = useProductCatalog()
  const [seen, setSeen] = useState<Record<string, PickerProduct>>({})
  const lookup = (id: string) =>
    seen[id] ?? catalog.products.find((product) => product.id === id)

  if (catalog.products.length === 0 && value.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No products yet — add some under Products, then pick them here.
      </p>
    )
  }

  const move = (index: number, by: number) => {
    const next = [...value]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item!)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {value.map((id, index) => {
            const product = lookup(id)
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border p-1.5"
              >
                <div className="bg-muted size-8 shrink-0 overflow-hidden rounded-md">
                  {product?.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- merchant CDN
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {product?.title ?? 'A product no longer in the catalogue'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  title="Move up"
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  title="Move down"
                >
                  <ArrowDown className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  title="Remove"
                >
                  <X className="size-3" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {value.length < max && (
        <ProductPickerDialog
          initialProducts={catalog.products}
          initialCursor={catalog.cursor}
          currencyCode={catalog.currencyCode}
          title="Add a product"
          onPick={(productId, _variantId, product) => {
            setSeen((current) => ({ ...current, [productId]: product }))
            if (!value.includes(productId)) onChange([...value, productId])
          }}
          trigger={
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-3.5" />
              Add a product
            </Button>
          }
        />
      )}
    </div>
  )
}
