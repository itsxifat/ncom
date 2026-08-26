'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * The two halves of Discounts & offers.
 *
 * They are one section rather than two entries in the rail because they answer
 * the same question — what is this workspace giving away right now — and a
 * merchant chasing "why is this order cheaper than I expected" has to look at
 * both. Codes and bundles that live in different corners of the app get
 * configured against each other.
 */
const TABS = [
  { href: '/discounts', label: 'Discounts' },
  { href: '/discounts/offers', label: 'Offers' },
]

export function SectionTabs() {
  const pathname = usePathname()

  return (
    <nav className="border-border flex items-center gap-1 border-b">
      {TABS.map((tab) => {
        // Offers own everything under /discounts/offers; Discounts owns the
        // rest, including /discounts/new and a discount's own page.
        const isOffers = tab.href.endsWith('/offers')
        const onOffers = pathname.startsWith('/discounts/offers')
        const active = isOffers ? onOffers : !onOffers

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
