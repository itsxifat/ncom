import { z } from 'zod'

/**
 * What a countdown block holds.
 *
 * Lives in its own module so the client half (`CountdownClock`) can import the
 * type without reaching into `index.tsx`, which pulls in the registry and must
 * stay server-safe.
 *
 * Every field has a default, and no default changes how an existing block
 * looks: a page saved before any of these options existed parses into exactly
 * the block it was — a boxed, centred, medium timer on the accent panel.
 */
export const countdownContentSchema = z.object({
  // ── What it says ────────────────────────────────────────────────────
  title: z.string().max(200).default('Offer ends in'),
  subtitle: z.string().max(300).default(''),

  // ── When it ends ────────────────────────────────────────────────────
  /**
   * `deadline` counts to one moment for everybody; `evergreen` gives each
   * visitor their own window, starting when they first land.
   */
  mode: z.enum(['deadline', 'evergreen']).default('deadline'),
  /**
   * An ISO 8601 instant. Stored in UTC so the sale ends at the same moment for
   * every buyer — the editor converts to and from the merchant's own clock.
   *
   * Still a plain string rather than a datetime, because blocks saved before
   * this field picked a timezone hold a naive "YYYY-MM-DDTHH:mm" and must keep
   * parsing.
   */
  endsAt: z.string().default(''),
  /** Evergreen only: how long one visitor's window lasts. */
  durationMinutes: z.number().int().min(1).max(20_160).default(20),

  // ── How it looks ────────────────────────────────────────────────────
  style: z.enum(['boxes', 'pill', 'minimal']).default('boxes'),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  /**
   * Which units to show. `auto` drops the days column while there are none
   * left, which is what stops a flash sale reading "00 Days".
   */
  units: z.enum(['auto', 'dhms', 'hms', 'ms']).default('auto'),
  showLabels: z.boolean().default(true),
  /** The filled card behind the timer. Off leaves it on the page background. */
  panel: z.boolean().default(true),
  /** Overrides the theme accent for this block only. Empty means inherit. */
  accentColor: z.string().max(40).default(''),

  // ── Urgency ─────────────────────────────────────────────────────────
  /** Minutes below which the timer turns red and pulses. 0 disables it. */
  urgentAtMinutes: z.number().int().min(0).max(1440).default(0),

  // ── Call to action ──────────────────────────────────────────────────
  /** Empty hides the button. Anything else jumps to the order form. */
  ctaText: z.string().max(120).default(''),

  // ── After it ends ───────────────────────────────────────────────────
  onExpire: z.enum(['message', 'zeros', 'hide']).default('message'),
  expiredText: z.string().max(200).default('This offer has ended.'),
})

export type CountdownContent = z.infer<typeof countdownContentSchema>

export const countdownDefaultContent: CountdownContent =
  countdownContentSchema.parse({})

/**
 * The moment a deadline-mode block counts to, or null when it has none.
 *
 * Tolerates the naive local-time strings written before `endsAt` stored an
 * instant: `Date` reads a zoneless string as local time, which is what the
 * merchant meant when they typed it.
 */
export function resolveDeadline(content: CountdownContent): number | null {
  if (content.mode === 'evergreen') return null
  if (!content.endsAt) return null
  const parsed = new Date(content.endsAt).getTime()
  return Number.isNaN(parsed) ? null : parsed
}
