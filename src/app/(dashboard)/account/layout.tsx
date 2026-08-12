import { PageHeader } from '@/components/app/page-header'
import { PillTabs } from '@/components/app/pill-tabs'

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-8">
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
    </div>
  )
}
