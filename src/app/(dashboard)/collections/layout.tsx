import { PageShell } from '@/components/app/page-shell'
import { SectionHeader } from '@/components/app/section-header'
import { CATALOG_TABS } from '@/components/dashboard/section-nav'

/**
 * One section across four routes: products, how they are grouped, and how
 * many are left. The header and tabs show on the list pages only; see
 * `SectionHeader`.
 */
export default function CatalogLayout({
  children,
}: LayoutProps<'/collections'>) {
  return (
    <PageShell width="wide" className="gap-6">
      <SectionHeader
        title="Products"
        description="Everything you sell, how it is grouped, and how much is left."
        tabs={CATALOG_TABS}
      />
      {children}
    </PageShell>
  )
}
