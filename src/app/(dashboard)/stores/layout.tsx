import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageShell } from '@/components/app/page-shell'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/app/section-header'
import { PAGES_TABS } from '@/components/dashboard/section-nav'

/**
 * Websites — online stores and landing pages — and the images on them, as one
 * section. The header
 * and tabs show on the list pages only; a single store has its own shell
 * below this one. See `SectionHeader`.
 */
export default function PagesLayout({ children }: LayoutProps<'/stores'>) {
  return (
    <PageShell width="wide" className="gap-6">
      <SectionHeader
        title="Websites"
        description="Your online stores and landing pages, and the images on them."
        tabs={PAGES_TABS}
        actions={
          <Button render={<Link href="/stores/new" />} nativeButton={false}>
            <Plus />
            Create a website
          </Button>
        }
      />
      {children}
    </PageShell>
  )
}
