import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { PillTabs } from '@/components/app/pill-tabs'

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PageShell>
      <PageHeader
        eyebrow="You"
        title="Account"
        description="Your details and how you sign in."
      />
      <PillTabs
        items={[
          { href: '/account/profile', label: 'Profile' },
          { href: '/account/security', label: 'Security' },
        ]}
      />
      {children}
    </PageShell>
  )
}
