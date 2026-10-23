'use client'

import { El } from '../elements'
import { LISTING_SORTS, type ListingSort } from '../storefront'
import { useStoreText } from '@/modules/storefront/StoreTextProvider'

/**
 * The sort dropdown on a catalogue page.
 *
 * Changing it reloads the page with `?sort=` rather than re-sorting in the
 * browser: the list on screen is one page of a longer one, and sorting the
 * page you happen to be on would put the cheapest of these twenty-four first,
 * not the cheapest in the category. It also means the sorted list has an
 * address a shopper can share.
 */
export function SortMenu({
  sort,
  editing,
}: {
  sort: ListingSort
  editing?: boolean
}) {
  const { words } = useStoreText()
  return (
    <El as="label" part="sort" className="flex items-center gap-2 text-sm">
      <span className="opacity-70">{words.sortBy}</span>
      <select
        value={sort}
        disabled={editing}
        onChange={(event) => {
          const url = new URL(window.location.href)
          if (event.target.value === 'featured') url.searchParams.delete('sort')
          else url.searchParams.set('sort', event.target.value)
          url.searchParams.delete('page')
          window.location.href = url.toString()
        }}
        className="h-10 rounded-[min(var(--page-radius),0.75rem)] border border-[color-mix(in_oklab,var(--page-text)_18%,transparent)] bg-[var(--page-background)] px-3 text-sm font-medium outline-none"
      >
        {LISTING_SORTS.map((value) => (
          <option key={value} value={value}>
            {words.sort[value]}
          </option>
        ))}
      </select>
    </El>
  )
}
