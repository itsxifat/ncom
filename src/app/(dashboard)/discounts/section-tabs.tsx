import { SectionTabs } from '@/components/app/section-tabs'

/**
 * The two halves of Discounts & offers.
 *
 * They are one section rather than two entries in the rail because they answer
 * the same question — what is this workspace giving away right now — and a
 * merchant chasing "why is this order cheaper than I expected" has to look at
 * both. Codes and bundles that live in different corners of the app get
 * configured against each other.
 *
 * Both tabs are `nested`: Discounts owns /discounts/new and a discount's own
 * page, Offers owns everything under /discounts/offers, and the longer href
 * wins where both match.
 */
export function DiscountsTabs() {
  return (
    <SectionTabs
      label="Discounts & offers"
      items={[
        { href: '/discounts', label: 'Discounts', nested: true },
        { href: '/discounts/offers', label: 'Offers', nested: true },
      ]}
    />
  )
}
