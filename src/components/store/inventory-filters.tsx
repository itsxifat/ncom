'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/store/form-controls'

/**
 * Filters for the inventory table.
 *
 * A plain GET form, so the current view is a URL: a merchant can bookmark
 * "everything out of stock in the Dhaka warehouse", share it, and reload it
 * after adjusting a count without losing their place.
 *
 * The selects submit on change rather than waiting for a button. Choosing "Out
 * of stock" from a dropdown and then having to find a Filter button is the kind
 * of step people forget, and the previous version of this page compounded it by
 * driving the low-stock filter from a styled checkbox next to a submit button.
 *
 * `page` is deliberately not carried over: changing a filter changes what the
 * result set is, and landing on page 4 of a smaller one shows an empty table.
 */
export function InventoryFilters({
  search,
  stock,
  sort,
  locationId,
  locations,
}: {
  search: string
  stock: string
  sort: string
  locationId: string
  locations: { id: string; name: string }[]
}) {
  const formRef = useRef<HTMLFormElement>(null)

  const [stockValue, setStockValue] = useState(stock)
  const [sortValue, setSortValue] = useState(sort)
  const [locationValue, setLocationValue] = useState(locationId)

  // Submitted from an effect rather than straight out of the change handler.
  // FormSelect posts through a hidden input that React syncs on render, so
  // calling requestSubmit() inside onChange submits the *previous* selection —
  // the dropdown would visibly say "Out of stock" while the table showed low
  // stock. Waiting a commit means the DOM the browser serialises is the one the
  // merchant is looking at.
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) return
    dirty.current = false
    formRef.current?.requestSubmit()
  }, [stockValue, sortValue, locationValue])

  function change(setter: (value: string) => void) {
    return (event: { target: { value: string } }) => {
      dirty.current = true
      setter(event.target.value)
    }
  }

  const isFiltered = Boolean(search) || stock !== 'all' || Boolean(locationId)

  return (
    <form
      ref={formRef}
      action="/inventory"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="relative w-full sm:w-72">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Product, variant, SKU or barcode"
          aria-label="Search inventory"
          className="pl-9"
        />
      </div>

      <FormSelect
        name="stock"
        value={stockValue}
        aria-label="Stock level"
        className="w-40"
        onChange={change(setStockValue)}
      >
        <option value="all">All stock levels</option>
        <option value="low">Low stock</option>
        <option value="out">Out of stock</option>
        <option value="in">In stock</option>
      </FormSelect>

      {locations.length > 1 && (
        <FormSelect
          name="location"
          value={locationValue}
          aria-label="Location"
          className="w-44"
          onChange={change(setLocationValue)}
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </FormSelect>
      )}

      <FormSelect
        name="sort"
        value={sortValue}
        aria-label="Sort by"
        className="w-44"
        onChange={change(setSortValue)}
      >
        <option value="product">Product A–Z</option>
        <option value="available-asc">Least stock first</option>
        <option value="available-desc">Most stock first</option>
        <option value="updated">Recently changed</option>
      </FormSelect>

      <Button type="submit" variant="outline">
        Search
      </Button>

      {isFiltered && (
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href="/inventory" />}
        >
          <X />
          Clear
        </Button>
      )}
    </form>
  )
}
