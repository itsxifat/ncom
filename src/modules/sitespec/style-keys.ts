import type { SectionConfig } from '../sections/types'
import { extraKey } from '../sections/elementDescriptors'

/**
 * The section design a design sees and sets: what export.ts sends out in a
 * section's `style`, and what normalize.ts accepts back.
 *
 * A section's per-element styling (`elements`) and the elements added to it
 * (`extras`) travel beside `style`, under their own names, and are laid over
 * what a section has rather than replacing it — see `restyleConfig`. The rest
 * of a section's config — its text and heading colours, its name in the
 * layers list — is invisible to a design and must survive one untouched.
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
  'customClassName',
] as const satisfies readonly (keyof SectionConfig)[]

export type StyleKey = (typeof STYLE_KEYS)[number]

export function isStyleKey(key: string): key is StyleKey {
  return (STYLE_KEYS as readonly string[]).includes(key)
}

/**
 * A section's per-element design and added elements after a design rewrote
 * it: the design's element designs over the old ones, key by key, less the
 * ones it set to null (`cleared`); its list of added elements in place of the
 * old list when it sent one; and no styling left behind for an added element
 * that is gone.
 *
 * Laid over rather than replaced, unlike a section's style keys: a model that
 * changes one headline should not have to copy out every other element's
 * design to keep it, and a page's element styling is the merchant's most
 * detailed work — the last thing a slip should be able to wipe.
 */
export function mergeElementConfig(
  existing: SectionConfig | null | undefined,
  design: SectionConfig,
  cleared: readonly string[] = []
): Pick<SectionConfig, 'elements' | 'extras'> {
  const extras = design.extras ?? existing?.extras
  const elements = { ...(existing?.elements ?? {}) }
  for (const key of cleared) delete elements[key]
  Object.assign(elements, design.elements)
  if (design.extras) {
    const kept = new Set(design.extras.map((extra) => extraKey(extra.id)))
    for (const key of Object.keys(elements)) {
      if (key.startsWith('x:') && !kept.has(key)) delete elements[key]
    }
  }
  return {
    ...(Object.keys(elements).length > 0 && { elements }),
    ...(extras && extras.length > 0 && { extras }),
  }
}

/** A section's config less its element designs and added elements. */
export function withoutElements(
  config: SectionConfig | null | undefined
): SectionConfig {
  const rest = { ...config }
  delete rest.elements
  delete rest.extras
  return rest
}

/**
 * A section's config after a design rewrote it, when the design was written
 * from that section's own export (so its `style` is the whole of the section's
 * style): the design's style keys replace the old ones — a style it left out
 * was taken off — its element designs are laid over the old ones (see
 * `mergeElementConfig`), and everything the design could not see is kept.
 *
 * `rejected` names style keys the design set to something invalid; those keep
 * their old value rather than being cleared, because a bad value was a slip,
 * not a request to remove the style.
 */
export function restyleConfig(
  existing: SectionConfig | null | undefined,
  designStyle: SectionConfig,
  rejected: readonly string[] = [],
  cleared: readonly string[] = []
): SectionConfig {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(withoutElements(existing))) {
    if (!isStyleKey(key) || rejected.includes(key)) next[key] = value
  }
  for (const [key, value] of Object.entries(withoutElements(designStyle))) {
    if (isStyleKey(key) && !rejected.includes(key)) next[key] = value
  }
  return {
    ...next,
    ...mergeElementConfig(existing, designStyle, cleared),
  } as SectionConfig
}

/**
 * A section's config with a design's laid over it, for a design that never
 * saw the section — a store's header matched only by kind. Its style keys go
 * over the old ones and keep the rest; its element designs, the same way.
 */
export function layerConfig(
  existing: SectionConfig | null | undefined,
  design: SectionConfig,
  cleared: readonly string[] = []
): SectionConfig {
  return {
    ...withoutElements(existing),
    ...withoutElements(design),
    ...mergeElementConfig(existing, design, cleared),
  }
}
