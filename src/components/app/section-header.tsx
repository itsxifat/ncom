'use client'

import { usePathname } from 'next/navigation'
import { PageHeader } from '@/components/app/page-header'
import { SectionTabs, type SectionTab } from '@/components/app/section-tabs'

/**
 * The title and tab row of a section that spans several top-level routes —
 * Products is /products, /categories, /collections and /inventory.
 *
 * It renders from each route's layout, and only on the list pages the tabs
 * name. A product's own editor sits under /products too, but it is a page
 * about one thing with its own heading and way back; a section title and a
 * row of tabs above it would be a second header saying something else.
 */
export function SectionHeader({
  title,
  description,
  tabs,
  actions,
}: {
  title: string
  description?: string
  tabs: SectionTab[]
  /** Buttons beside the title — the section's main "make a new one". */
  actions?: React.ReactNode
}) {
  const pathname = usePathname()
  if (!tabs.some((tab) => tab.href === pathname)) return null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={title} description={description} actions={actions} />
      <SectionTabs label={title} items={tabs} />
    </div>
  )
}
