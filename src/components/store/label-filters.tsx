'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { cn } from '@/lib/utils'

/**
 * Narrowing the print queue.
 *
 * Kept separate from the order list's filter bar even though they rhyme: the
 * order book filters by payment and delivery status because it is used to
 * answer questions, and this one filters by *which pile of parcels*, because it
 * is used standing at a printer. Merging them would mean one control set that
 * carries both vocabularies and fits neither bench.
 *
 * Three views, one search box, nothing to submit.
 */
const SEARCH_DELAY_MS = 300

export function LabelFilters({
  views,
  stores,
  total,
}: {
  views: { key: string; label: string }[]
  stores: { id: string; name: string }[]
  total: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const search = params.get('q') ?? ''
  const view = params.get('view') ?? views[0]?.key ?? ''
  const store = params.get('store') ?? ''

  const [draft, setDraft] = useState(search)

  // Adjusted during render rather than in an effect, so the box never shows a
  // term that has already been cleared. See React's "adjusting state when props
  // change".
  const [syncedSearch, setSyncedSearch] = useState(search)
  if (syncedSearch !== search) {
    setSyncedSearch(search)
    setDraft(search)
  }

  const push = (next: Record<string, string | null>) => {
    const query = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') query.delete(key)
      else query.set(key, value)
    }
    // A changed filter invalidates the page number — otherwise a packer lands
    // on an empty page three and concludes the queue is empty.
    query.delete('page')

    const queryString = query.toString()
    startTransition(() => {
      router.push(queryString ? `${pathname}?${queryString}` : pathname)
    })
  }

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (draft === search) return

    const timer = window.setTimeout(
      () => push({ q: draft || null }),
      SEARCH_DELAY_MS
    )
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `push` is rebuilt every render; depending on it would reset the timer each time
  }, [draft, search])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search order number, email or phone"
            aria-label="Search the print queue"
            className="pl-9"
          />
          {(pending || draft !== search) && (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>

        {/* One workspace packs several sites' parcels, usually one pile at a
            time — so a print run starts by naming the pile. */}
        {stores.length > 1 && (
          <FormSelect
            value={store}
            onChange={(event) => push({ store: event.target.value || null })}
            aria-label="Store"
            className="w-auto"
          >
            <option value="">Every store</option>
            {stores.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </FormSelect>
        )}

        {(search || store) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft('')
              push({ q: null, store: null })
            }}
          >
            <X />
            Clear
          </Button>
        )}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {views.map((entry) => {
          const isActive = view === entry.key
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => push({ view: entry.key })}
              aria-pressed={isActive}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              )}
            >
              {entry.label}
              {isActive && (
                <span className="ml-1.5 tabular-nums opacity-70">{total}</span>
              )}
            </button>
          )
        })}

        {search && (
          <Badge variant="secondary" className="ml-1 gap-1 normal-case">
            “{search}”
          </Badge>
        )}
      </div>
    </div>
  )
}
