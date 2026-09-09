'use client'

import { useMemo } from 'react'
import { useBuilderStore } from './store'

/**
 * The page's own colours, offered first in every colour picker.
 *
 * Almost every colour decision on a landing page is "the same as that other
 * thing", not a fresh point in colour space — and a merchant who reaches for
 * the hue slider to re-mix their brand colour by eye ends up with four
 * near-identical blues across one page. Putting the theme's four colours one
 * click away is what stops that.
 *
 * The section's own overrides are included when it has any, for the same
 * reason: a block with a custom background is the thing the next colour on that
 * block most likely has to sit against.
 */
export function useThemeSwatches(): string[] {
  const theme = useBuilderStore((s) => s.theme)
  const section = useBuilderStore((s) =>
    s.sections.find((candidate) => candidate.id === s.selectedSectionId)
  )

  return useMemo(() => {
    const colors = [
      theme?.primaryColor,
      theme?.secondaryColor,
      theme?.textColor,
      theme?.backgroundColor,
      section?.config?.backgroundColor,
      section?.config?.textColor,
      section?.config?.headingColor,
    ]
    return Array.from(
      new Set(
        colors.filter(
          (color): color is string =>
            typeof color === 'string' && color.trim().length > 0
        )
      )
    )
  }, [theme, section])
}
