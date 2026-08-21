/**
 * The colour language of the order list.
 *
 * A merchant scanning a hundred rows on a Saturday morning is not reading
 * status text — they are looking for the red ones. So the row itself carries
 * the status, and which status is which colour is theirs to decide: a shop that
 * lives or dies on failed deliveries wants FAILED screaming at them, while one
 * fighting fraud wants the review queue to be the loud thing.
 *
 * Client-safe, like lib/plans.ts: the list renders these, the settings screen
 * explains them, and the server validates what comes back. Nothing here reads
 * the database.
 *
 * Tones, not hex. A merchant given a colour wheel will eventually pick
 * something that is unreadable in one of the two themes — and the order list is
 * the screen this product is used on all day. Each tone below is a pair of
 * token-based classes that has been checked in both.
 */

import type { OrderWorkflowState } from '@/generated/prisma/enums'

export const STATUS_TONES = [
  'none',
  'green',
  'amber',
  'red',
  'blue',
  'purple',
  'slate',
] as const

export type StatusTone = (typeof STATUS_TONES)[number]

interface ToneStyle {
  label: string
  /** The row tint. Deliberately low-alpha — this sits under real text. */
  row: string
  /** The 3px spine down the leading edge, which is what the eye actually catches. */
  bar: string
  /** A solid swatch, for the settings picker and the legend. */
  swatch: string
}

/**
 * Alpha-tinted backgrounds rather than solid colours, for two reasons: they
 * compose with the row's own hover state instead of fighting it, and they keep
 * `text-foreground` legible in both themes without a second foreground token
 * per tone.
 */
export const TONE_STYLES: Record<StatusTone, ToneStyle> = {
  none: {
    label: 'No colour',
    row: '',
    bar: 'bg-transparent',
    swatch: 'bg-muted border border-border',
  },
  green: {
    label: 'Green',
    row: 'bg-emerald-500/8 hover:bg-emerald-500/14 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/16',
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    swatch: 'bg-emerald-500 dark:bg-emerald-400',
  },
  amber: {
    label: 'Amber',
    row: 'bg-amber-500/10 hover:bg-amber-500/16 dark:bg-amber-400/10 dark:hover:bg-amber-400/16',
    bar: 'bg-amber-500 dark:bg-amber-400',
    swatch: 'bg-amber-500 dark:bg-amber-400',
  },
  red: {
    label: 'Red',
    row: 'bg-red-500/8 hover:bg-red-500/14 dark:bg-red-400/10 dark:hover:bg-red-400/16',
    bar: 'bg-red-500 dark:bg-red-400',
    swatch: 'bg-red-500 dark:bg-red-400',
  },
  blue: {
    label: 'Blue',
    row: 'bg-sky-500/8 hover:bg-sky-500/14 dark:bg-sky-400/10 dark:hover:bg-sky-400/16',
    bar: 'bg-sky-500 dark:bg-sky-400',
    swatch: 'bg-sky-500 dark:bg-sky-400',
  },
  purple: {
    label: 'Purple',
    row: 'bg-violet-500/8 hover:bg-violet-500/14 dark:bg-violet-400/10 dark:hover:bg-violet-400/16',
    bar: 'bg-violet-500 dark:bg-violet-400',
    swatch: 'bg-violet-500 dark:bg-violet-400',
  },
  slate: {
    label: 'Grey',
    row: 'bg-slate-500/8 hover:bg-slate-500/14 dark:bg-slate-400/8 dark:hover:bg-slate-400/14',
    bar: 'bg-slate-400 dark:bg-slate-500',
    swatch: 'bg-slate-400 dark:bg-slate-500',
  },
}

/**
 * The out-of-the-box mapping, which matches the badge colours already used
 * across the app so a merchant who never opens the setting still gets a list
 * that agrees with itself.
 *
 * Green is settled and good, red is money at risk, blue is moving, amber is
 * waiting on a person, grey is closed and needs nothing.
 */
export const DEFAULT_STATUS_COLORS: Record<OrderWorkflowState, StatusTone> = {
  PENDING: 'none',
  FRAUD_REVIEW: 'amber',
  PROCESSING: 'blue',
  DISPATCHED: 'blue',
  IN_TRANSIT: 'blue',
  OUT_FOR_DELIVERY: 'purple',
  DELIVERED: 'green',
  PARTIALLY_DELIVERED: 'amber',
  RETURNED: 'red',
  CANCELLED: 'slate',
  FAILED: 'red',
}

/** A partial override map, as stored on OrganizationSettings. */
export type StatusColorMap = Partial<Record<OrderWorkflowState, StatusTone>>

export function isStatusTone(value: unknown): value is StatusTone {
  return (STATUS_TONES as readonly unknown[]).includes(value)
}

/**
 * Reads whatever is in the JSON column into a map that is safe to render.
 *
 * Everything unrecognised is dropped rather than rejected — the column is
 * hand-editable through /admin and survives across releases that add workflow
 * states, and a single bad key must not blank the whole order list.
 */
export function parseStatusColors(raw: unknown): StatusColorMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const parsed: StatusColorMap = {}
  for (const [state, tone] of Object.entries(raw as Record<string, unknown>)) {
    if (!(state in DEFAULT_STATUS_COLORS)) continue
    if (!isStatusTone(tone)) continue
    parsed[state as OrderWorkflowState] = tone
  }
  return parsed
}

/** The merchant's choices over the defaults, as a total map. */
export function resolveStatusColors(
  overrides: StatusColorMap | null | undefined
): Record<OrderWorkflowState, StatusTone> {
  return { ...DEFAULT_STATUS_COLORS, ...(overrides ?? {}) }
}
