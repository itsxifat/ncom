import { PageShell } from '@/components/app/page-shell'
import { SectionHeader } from '@/components/app/section-header'
import { PAGES_TABS } from '@/components/dashboard/section-nav'

/**
 * Websites, their pages and the images on them, as one section. The header
 * and tabs show on the list pages only; a single store has its own shell
 * below this one. See `SectionHeader`.
 */
export default function PagesLayout({ children }: LayoutProps<'/media'>) {
  return (
    <PageShell width="wide" className="gap-6">
      <SectionHeader
        title="Pages"
        description="Your websites, the pages you sell from, and the images on them."
        tabs={PAGES_TABS}
      />
      {children}
    </PageShell>
  )
}
