import { cn } from '@/lib/utils'

/**
 * Shared design options for the built-in React sections.
 *
 * Every section that renders a repeating list faces the same two questions —
 * how many across, and what does each item sit on — so those answers live here
 * rather than being re-invented per section. A section imports the option list
 * for its `variant` field and the class helper for its renderer, which keeps
 * "bordered" looking the same whether it is a feature, a card or a testimonial.
 *
 * Values are stored strings, so adding an option is safe but renaming one
 * silently resets any section already using the old name. Treat these as
 * permanent once shipped.
 */

/** Column counts for a responsive grid. Everything collapses to one on phones. */
export const COLUMN_CLASSES: Record<string, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
}

export function columnClass(columns: number | undefined): string {
  return COLUMN_CLASSES[String(columns ?? 3)] ?? COLUMN_CLASSES['3']
}

/**
 * How an item in a list is presented.
 *
 * `plain` is the historical look — no surface at all — and is the default
 * everywhere, so a section saved before these options existed renders exactly
 * as it did before.
 */
export const SURFACE_OPTIONS = [
  'plain',
  'bordered',
  'card',
  'elevated',
  'soft',
  'outlined',
  'dark',
] as const

export type Surface = (typeof SURFACE_OPTIONS)[number]

const BORDER =
  'border border-[color-mix(in_oklab,var(--page-text)_14%,transparent)]'

export function surfaceClass(surface: string | undefined): string {
  switch (surface) {
    case 'bordered':
      return cn(BORDER, 'rounded-[var(--page-radius)] p-5')
    case 'card':
      return cn(
        BORDER,
        'rounded-[var(--page-radius)] bg-[color-mix(in_oklab,var(--page-text)_3%,var(--page-background))] p-5'
      )
    case 'elevated':
      return 'rounded-[var(--page-radius)] bg-[var(--page-background)] p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)]'
    case 'soft':
      return 'rounded-[var(--page-radius)] bg-[color-mix(in_oklab,var(--page-text)_6%,transparent)] p-5'
    case 'outlined':
      return 'rounded-[var(--page-radius)] border-2 border-[var(--page-primary)] p-5'
    case 'dark':
      return 'rounded-[var(--page-radius)] bg-[var(--page-text)] text-[var(--page-background)] p-5'
    default:
      return ''
  }
}

/** Gap presets, so spacing is a choice rather than a hardcoded `gap-8`. */
export function gapClass(density: string | undefined): string {
  switch (density) {
    case 'tight':
      return 'gap-3'
    case 'snug':
      return 'gap-5'
    case 'loose':
      return 'gap-12'
    default:
      return 'gap-8'
  }
}

export const DENSITY_OPTIONS = ['tight', 'snug', 'normal', 'loose'] as const

/** Text alignment for a section's own content, independent of the page theme. */
export function alignClass(align: string | undefined): string {
  switch (align) {
    case 'center':
      return 'text-center'
    case 'right':
      return 'text-right'
    default:
      return ''
  }
}

export const ALIGN_OPTIONS = ['left', 'center', 'right'] as const

/** Image aspect ratios, matching the Liquid commerce sections' vocabulary. */
export function ratioClass(ratio: string | undefined): string {
  switch (ratio) {
    case 'square':
      return 'aspect-square'
    case 'portrait':
      return 'aspect-3/4'
    case 'landscape':
      return 'aspect-4/3'
    case 'wide':
      return 'aspect-video'
    default:
      return ''
  }
}

export const RATIO_OPTIONS = [
  'square',
  'portrait',
  'landscape',
  'wide',
  'auto',
] as const

/**
 * The three controls almost every list section wants, ready to spread into an
 * `editorFields` array. Sections add their own on top.
 */
export const LIST_DESIGN_FIELDS = [
  {
    type: 'select' as const,
    name: 'surface',
    label: 'Item design',
    options: [...SURFACE_OPTIONS],
  },
  {
    type: 'number' as const,
    name: 'columns',
    label: 'Columns',
    min: 1,
    max: 5,
    step: 1,
  },
  {
    type: 'select' as const,
    name: 'density',
    label: 'Spacing',
    options: [...DENSITY_OPTIONS],
  },
]
