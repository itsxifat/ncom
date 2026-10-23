import type { SectionConfig } from '../sections/types'

/**
 * The section design a design sees and sets: what export.ts sends out in a
 * section's `style`, and what normalize.ts accepts back.
 *
 * Everything else in a section's config — its per-element styling, the
 * elements the merchant added, its text and heading colours, a custom class —
 * is invisible to a design and must survive one untouched.
 *
 * Its own module, free of the reader's server-only font lookup, because the
 * builder applies designs in the browser and needs the same list to do it.
 */
export const STYLE_KEYS = [
  'backgroundVariant',
  'backgroundColor',
  'backgroundImageUrl',
  'backgroundSize',
  'backgroundPosition',
  'backgroundOverlay',
  'alignment',
  'paddingTop',
  'paddingBottom',
  'maxWidth',
  'fullWidth',
  'headingFont',
  'bodyFont',
  'borderRadius',
  'borderTop',
  'borderBottom',
  'hideOnMobile',
  'hideOnDesktop',
  'anchorId',
] as const satisfies readonly (keyof SectionConfig)[]

export type StyleKey = (typeof STYLE_KEYS)[number]

export function isStyleKey(key: string): key is StyleKey {
  return (STYLE_KEYS as readonly string[]).includes(key)
}

/**
 * A section's config after a design rewrote it, when the design was written
 * from that section's own export (so its `style` is the whole of the section's
 * style): the design's style keys replace the old ones — a style it left out
 * was taken off — and everything the design could not see is kept.
 *
 * `rejected` names style keys the design set to something invalid; those keep
 * their old value rather than being cleared, because a bad value was a slip,
 * not a request to remove the style.
 */
export function restyleConfig(
  existing: SectionConfig | null | undefined,
  designStyle: SectionConfig,
  rejected: readonly string[] = []
): SectionConfig {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (!isStyleKey(key) || rejected.includes(key)) next[key] = value
  }
  for (const [key, value] of Object.entries(designStyle)) {
    if (isStyleKey(key) && !rejected.includes(key)) next[key] = value
  }
  return next as SectionConfig
}
