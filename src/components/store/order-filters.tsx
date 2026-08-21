'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { WORKFLOW_STATE_LABEL } from '@/server/courier/statusMap'
import type {
  FinancialStatus,
  OrderWorkflowState,
} from '@/generated/prisma/enums'
import { cn } from '@/lib/utils'

/**
 * Finding orders.
 *
 * The old version of this was a row of dropdowns and a Filter button, which
 * asked the merchant to compose a query and then submit it. That is the wrong
 * shape for this screen: the questions actually asked of an order list are a
 * small fixed set — "what needs reviewing", "what is still here", "what came
 * back" — and each one was three interactions away.
 *
 * So the common questions are one tap, everything narrower lives behind
 * "More filters", and every active filter is a pill that says what it is and
 * removes itself. Nothing needs submitting: typing searches, choosing filters.
 *
 * The URL stays the source of truth, so a filtered list is still a link a
 * merchant can send to whoever is packing.
 */

const FINANCIAL_VALUES = [
  'PENDING',
  'AUTHORIZED',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'VOIDED',
] as const satisfies readonly FinancialStatus[]

const WORKFLOW_VALUES = [
  'PENDING',
  'FRAUD_REVIEW',
  'PROCESSING',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'RETURNED',
  'CANCELLED',
  'FAILED',
] as const satisfies readonly OrderWorkflowState[]

const FINANCIAL_LABEL: Record<FinancialStatus, string> = {
  PENDING: 'Payment pending',
  AUTHORIZED: 'Authorized',
  PARTIALLY_PAID: 'Partly paid',
  PAID: 'Paid',
  PARTIALLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
  VOIDED: 'Voided',
}

/**
 * The saved views, in the order a working day uses them.
 *
 * "Needs action" is not a single status — it is the three states where the
 * parcel is still the merchant's problem — which is exactly why it belongs
 * here: it is the query nobody can express in one dropdown.
 */
const QUICK_VIEWS = [
  { key: '', label: 'All orders', params: {} },
  {
    key: 'todo',
    label: 'Needs action',
    params: { delivery: 'PENDING,PROCESSING,FRAUD_REVIEW' },
  },
  {
    key: 'review',
    label: 'Held for review',
    params: { delivery: 'FRAUD_REVIEW' },
  },
  {
    key: 'transit',
    label: 'With courier',
    params: { delivery: 'DISPATCHED,IN_TRANSIT,OUT_FOR_DELIVERY' },
  },
  { key: 'delivered', label: 'Delivered', params: { delivery: 'DELIVERED' } },
  {
    key: 'problem',
    label: 'Returned & failed',
    params: { delivery: 'RETURNED,FAILED' },
  },
  { key: 'unpaid', label: 'Unpaid', params: { financial: 'PENDING' } },
] as const

const SEARCH_DELAY_MS = 300

export function OrderFilters({
  stores,
  total,
}: {
  stores: { id: string; name: string }[]
  /** Shown beside the views so the count is attached to the query producing it. */
  total: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const search = params.get('q') ?? ''
  const delivery = params.get('delivery') ?? ''
  const financial = params.get('financial') ?? ''
  const store = params.get('store') ?? ''

  const [draft, setDraft] = useState(search)
  // Opened on load only when a filter is active that no saved view can show —
  // otherwise the panel would be sitting open every time someone taps a view.
  const [advanced, setAdvanced] = useState(() => Boolean(store))

  // The box follows the URL when the URL changes from somewhere else — the back
  // button, a pill being cleared. Adjusted during render rather than in an
  // effect: React re-runs this component before touching the DOM, so there is
  // no frame where the box still shows the term that was just cleared.
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
    // Any filter change invalidates the page number. Keeping it is how a
    // merchant lands on an empty page three of a two-page result and concludes
    // the orders are gone.
    query.delete('page')

    const queryString = query.toString()
    startTransition(() => {
      router.push(queryString ? `${pathname}?${queryString}` : pathname)
    })
  }

  // Debounced so the list does not re-query on every keystroke, and skipped
  // entirely when the box already agrees with the URL — otherwise the effect
  // that syncs them would push a duplicate navigation.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `push` is rebuilt every render; depending on it would reset the timer on each one
  }, [draft, search])

  const activeView =
    QUICK_VIEWS.find((view) => {
      if (view.key === '') return false
      const wantedDelivery =
        'delivery' in view.params ? view.params.delivery : ''
      const wantedFinancial =
        'financial' in view.params ? view.params.financial : ''
      return delivery === wantedDelivery && financial === wantedFinancial
    })?.key ?? (delivery || financial ? null : '')

  const pills: { key: string; label: string; clear: () => void }[] = []
  if (search) {
    pills.push({
      key: 'q',
      label: `“${search}”`,
      clear: () => {
        setDraft('')
        push({ q: null })
      },
    })
  }
  for (const state of delivery.split(',').filter(Boolean)) {
    pills.push({
      key: `delivery-${state}`,
      label: WORKFLOW_STATE_LABEL[state as OrderWorkflowState] ?? state,
      clear: () => {
        const rest = delivery
          .split(',')
          .filter((entry) => entry && entry !== state)
          .join(',')
        push({ delivery: rest || null })
      },
    })
  }
  if (financial) {
    pills.push({
      key: 'financial',
      label: FINANCIAL_LABEL[financial as FinancialStatus] ?? financial,
      clear: () => push({ financial: null }),
    })
  }
  if (store) {
    pills.push({
      key: 'store',
      label: stores.find((entry) => entry.id === store)?.name ?? 'Store',
      clear: () => push({ store: null }),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Search + the escape hatch ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search order number, email or phone"
            aria-label="Search orders"
            className="pl-9"
          />
          {(pending || draft !== search) && (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>

        <Button
          type="button"
          variant={advanced ? 'secondary' : 'outline'}
          onClick={() => setAdvanced((open) => !open)}
          aria-expanded={advanced}
        >
          <SlidersHorizontal />
          More filters
        </Button>

        {pills.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft('')
              push({ q: null, delivery: null, financial: null, store: null })
            }}
          >
            <X />
            Clear all
          </Button>
        )}
      </div>

      {/* ── Saved views ─────────────────────────────────────────────── */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {QUICK_VIEWS.map((view) => {
          const isActive = activeView === view.key
          return (
            <button
              key={view.key}
              type="button"
              onClick={() =>
                push({
                  delivery:
                    'delivery' in view.params ? view.params.delivery : null,
                  financial:
                    'financial' in view.params ? view.params.financial : null,
                })
              }
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              )}
              aria-pressed={isActive}
            >
              {view.label}
              {isActive && (
                <span className="ml-1.5 tabular-nums opacity-70">{total}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── The narrower questions, on request ──────────────────────── */}
      {advanced && (
        <div className="bg-muted/40 flex flex-wrap items-end gap-3 rounded-xl border p-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:flex-none">
            <span className="text-muted-foreground text-xs font-medium">
              Delivery status
            </span>
            <FormSelect
              value={delivery.includes(',') ? '' : delivery}
              onChange={(event) =>
                push({ delivery: event.target.value || null })
              }
              aria-label="Delivery status"
            >
              <option value="">Any delivery status</option>
              {WORKFLOW_VALUES.map((value) => (
                <option key={value} value={value}>
                  {WORKFLOW_STATE_LABEL[value]}
                </option>
              ))}
            </FormSelect>
          </label>

          <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:flex-none">
            <span className="text-muted-foreground text-xs font-medium">
              Payment
            </span>
            <FormSelect
              value={financial}
              onChange={(event) =>
                push({ financial: event.target.value || null })
              }
              aria-label="Payment status"
            >
              <option value="">Any payment status</option>
              {FINANCIAL_VALUES.map((value) => (
                <option key={value} value={value}>
                  {FINANCIAL_LABEL[value]}
                </option>
              ))}
            </FormSelect>
          </label>

          {/* One catalogue can be sold from several landing pages, so "today's
              parcels for this store" is where a print run starts. Hidden when
              there is only one — a filter with a single option is furniture. */}
          {stores.length > 1 && (
            <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:flex-none">
              <span className="text-muted-foreground text-xs font-medium">
                Store
              </span>
              <FormSelect
                value={store}
                onChange={(event) =>
                  push({ store: event.target.value || null })
                }
                aria-label="Store"
              >
                <option value="">Every store</option>
                {stores.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </FormSelect>
            </label>
          )}
        </div>
      )}

      {/* ── What is currently narrowing the list ────────────────────── */}
      {pills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Filtered by</span>
          {pills.map((pill) => (
            <Badge
              key={pill.key}
              variant="secondary"
              className="gap-1 pr-1 normal-case"
            >
              {pill.label}
              <button
                type="button"
                onClick={pill.clear}
                className="hover:bg-foreground/10 rounded-full p-0.5"
                aria-label={`Remove filter ${pill.label}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
