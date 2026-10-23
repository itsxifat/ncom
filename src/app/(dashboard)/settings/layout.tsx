import { PageShell } from '@/components/app/page-shell'
import { SettingsPageHeader } from '@/components/dashboard/settings-page-header'

/**
 * Every screen under /settings: the list itself, and each setting with a way
 * back to it. See `SettingsPageHeader`.
 */
export default function SettingsLayout({ children }: LayoutProps<'/settings'>) {
  return (
    <PageShell className="gap-6">
      <SettingsPageHeader />
      {children}
    </PageShell>
  )
}
