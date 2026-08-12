import {
  Users,
  Building2,
  FolderKanban,
  Globe,
  LayoutTemplate,
  Image as ImageIcon,
} from 'lucide-react'
import { getPlatformOverview } from '@/server/services/adminService'
import { PageHeader } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'

export default async function AdminOverviewPage() {
  const overview = await getPlatformOverview()

  // Published pages get the lime tile: it's the only number here that means
  // something is live in front of the public.
  const stats = [
    {
      label: 'Published pages',
      value: overview.publishedPageCount,
      icon: <Globe />,
      tone: 'lime' as const,
    },
    {
      label: 'Users',
      value: overview.userCount,
      icon: <Users />,
      tone: 'default' as const,
    },
    {
      label: 'Organizations',
      value: overview.organizationCount,
      icon: <Building2 />,
      tone: 'default' as const,
    },
    {
      label: 'Stores',
      value: overview.storeCount,
      icon: <FolderKanban />,
      tone: 'default' as const,
    },
    {
      label: 'Templates',
      value: overview.templateCount,
      icon: <LayoutTemplate />,
      tone: 'default' as const,
    },
    {
      label: 'Media assets',
      value: overview.mediaAssetCount,
      icon: <ImageIcon />,
      tone: 'default' as const,
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Platform"
        title="Overview"
        description="Counts across every tenant on this installation."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            tone={stat.tone}
          />
        ))}
      </div>
    </div>
  )
}
