import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SectionTabs } from '@/components/app/section-tabs'

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PageShell>
      <PageHeader
        title="Account"
        description="Your details and how you sign in."
      />
      <SectionTabs
        label="Account"
        items={[
          { href: '/account/profile', label: 'Profile' },
          { href: '/account/security', label: 'Security' },
        ]}
      />
      {children}
    </PageShell>
  )
}
