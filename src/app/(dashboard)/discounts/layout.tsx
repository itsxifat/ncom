import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SectionTabs } from './section-tabs'

/**
 * Everything the workspace gives away, in one section.
 *
 * Discounts are codes and automatic rules over an ordinary cart. Offers are
 * what a landing page's order form sells — a bundle, a mix-and-match ladder, a
 * pool priced piece by piece — and they can now be scoped to one page, one
 * store, or every store in the workspace, which is why they belong here rather
 * than inside any one page's builder.
 */
export default function DiscountsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PageShell width="wide">
      <PageHeader
        title="Discounts & offers"
        description="Codes, automatic discounts, and the bundles your landing pages sell."
      />
      <SectionTabs />
      {children}
    </PageShell>
  )
}
