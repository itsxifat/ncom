'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { TabCount } from '@/components/app/section-tabs'
import { WORKFLOW_STATE_LABEL } from '@/server/courier/statusMap'
import {
  HANDOFF_LABEL,
  HANDOFF_STATES,
  type HandoffState,
} from '@/lib/order-handoff'
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
 * The saved views, in the order a parcel moves through them — which is also
 * the order a working day uses them.
 *
 * "Needs action" is not a single status — it is the three states where the
 * parcel is still the merchant's problem — which is exactly why it belongs
 * here: it is the query nobody can express in one dropdown. It is also what
 * the number on the rail's Orders entry counts.
 *
 * Payment status is not a view any more. On a cash-on-delivery order "unpaid"
 * is true of everything not yet delivered, so the view mostly repeated the
 * ones beside it; it is still one choice away under More filters.
 */
const QUICK_VIEWS = [
  { key: '', label: 'All', params: {} },
  {
    key: 'todo',
    label: 'Needs action',
    params: { delivery: 'PENDING,PROCESSING,FRAUD_REVIEW' },
    urgent: true,
  },
  {
    key: 'review',
    label: 'Needs review',
    params: { delivery: 'FRAUD_REVIEW' },
    urgent: true,
  },
  {
    key: 'ship',
    label: 'Ready to ship',
    params: { delivery: 'PROCESSING' },
  },
  {
    key: 'transit',
    label: 'On the way',
    params: { delivery: 'DISPATCHED,IN_TRANSIT,OUT_FOR_DELIVERY' },
  },
  { key: 'delivered', label: 'Delivered', params: { delivery: 'DELIVERED' } },
  {
    key: 'problem',
    label: 'Returned or failed',
    params: { delivery: 'RETURNED,FAILED' },
  },
] as const

const SEARCH_DELAY_MS = 300

/**
 * Which summary count belongs on which chip.
 *
 * `NCOM` has none: counting the orders a workspace processes itself means
 * counting almost every order it has ever taken, and that is a full table scan
 * to put a number on the one chip whose answer is "the rest of them".
 */
const HANDOFF_COUNT_KEY: Record<
  HandoffState,
  'sent' | 'queued' | 'stuck' | 'conflicted' | null
> = {
  NCOM: null,
  SENT: 'sent',
  QUEUED: 'queued',
  STUCK: 'stuck',
  CONFLICT: 'conflicted',
}

/**
 * One handoff filter, with its count.
 *
 * A zero on an alarming chip is still drawn calmly — "Never arrived 0" is good
 * news, and colouring it red would train people to ignore the colour on the
 * day it means something.
 */
function HandoffChip({
  label,
  count,
  active,
  alarming = false,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  alarming?: boolean
  onClick: () => void
}) {
  const loud = alarming && (count ?? 0) > 0

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : loud
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
            : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
      )}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
      )}
    </button>
  )
}

export function OrderFilters({
  stores,
  stateCounts,
  showHandoff,
  handoffCounts,
}: {
  stores: { id: string; name: string }[]
  /**
   * Orders per workflow state, for the count on each view. On every view and
   * not just the open one, because "is anything waiting for review" should be
   * answered by reading the row, not by pressing each tab to find out.
   */
  stateCounts: Partial<Record<OrderWorkflowState, number>>
  /** Only for workspaces that have actually handed an order to a website. */
  showHandoff: boolean
  /**
   * How many orders sit in each handoff state right now.
   *
   * On the buttons rather than left to be discovered by pressing them: the
   * question a merchant opens this screen with is "did anything fail to reach
   * my site", and a zero on the button answers it without a round trip.
   */
  handoffCounts: {
    sent: number
    queued: number
    stuck: number
    conflicted: number
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const search = params.get('q') ?? ''
  const delivery = params.get('delivery') ?? ''
  const financial = params.get('financial') ?? ''
  const store = params.get('store') ?? ''
  const handoff = params.get('handoff') ?? ''

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

  // A payment filter from More filters narrows every view, so no view is
  // marked as current while one is set — the tab would describe a list that
  // is not the one on screen.
  const activeView = financial
    ? null
    : (QUICK_VIEWS.find(
        (view) =>
          view.key !== '' &&
          'delivery' in view.params &&
          view.params.delivery === delivery
      )?.key ?? (delivery ? null : ''))

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
  if (handoff) {
    pills.push({
      key: 'handoff',
      label: HANDOFF_LABEL[handoff as HandoffState] ?? handoff,
      clear: () => push({ handoff: null }),
    })
  }

  // A view's count is the sum over the states it asks for — the same states
  // the list query filters on, so the number is the length of the list.
  const viewCount = (view: (typeof QUICK_VIEWS)[number]): number => {
    const states: readonly OrderWorkflowState[] =
      'delivery' in view.params
        ? (view.params.delivery.split(',') as OrderWorkflowState[])
        : WORKFLOW_VALUES
    return states.reduce<number>(
      (sum, state) => sum + (stateCounts[state] ?? 0),
      0
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Saved views ─────────────────────────────────────────────── */}
      <nav
        aria-label="Order views"
        className="border-border flex scrollbar-none items-end gap-1 overflow-x-auto border-b"
      >
        {QUICK_VIEWS.map((view) => {
          const isActive = activeView === view.key
          const count = viewCount(view)
          return (
            <button
              key={view.key}
              type="button"
              onClick={() =>
                push({
                  delivery:
                    'delivery' in view.params ? view.params.delivery : null,
                  financial: null,
                })
              }
              className={cn(
                '-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors',
                isActive
                  ? 'border-foreground text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground border-transparent font-medium'
              )}
              aria-pressed={isActive}
            >
              {view.label}
              <TabCount
                tone={'urgent' in view && count > 0 ? 'attention' : 'default'}
              >
                {count.toLocaleString('en-US')}
              </TabCount>
            </button>
          )
        })}
      </nav>

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
              push({
                q: null,
                delivery: null,
                financial: null,
                store: null,
                handoff: null,
              })
            }}
          >
            <X />
            Clear all
          </Button>
        )}
      </div>

      {/* ── Where each order is being processed ─────────────────────
          Its own row rather than an option inside "More filters", because for
          a workspace handing orders over this is the first question of the
          morning — did everything reach my website — and an answer three taps
          away is an answer nobody checks. The counts are on the buttons so the
          reassuring case needs no tap at all. */}
      {showHandoff && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground shrink-0 text-xs font-medium">
            Processed
          </span>
          <div className="-mx-4 flex scrollbar-none gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <HandoffChip
              label="Anywhere"
              active={handoff === ''}
              onClick={() => push({ handoff: null })}
            />
            {HANDOFF_STATES.map((state) => (
              <HandoffChip
                key={state}
                label={HANDOFF_LABEL[state]}
                count={
                  HANDOFF_COUNT_KEY[state]
                    ? handoffCounts[HANDOFF_COUNT_KEY[state]!]
                    : undefined
                }
                alarming={state === 'STUCK' || state === 'CONFLICT'}
                active={handoff === state}
                onClick={() => push({ handoff: state })}
              />
            ))}
          </div>
        </div>
      )}

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
