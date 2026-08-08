import { getPlatformOverview } from '@/server/services/adminService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AdminOverviewPage() {
  const overview = await getPlatformOverview()

  const stats = [
    { label: 'Users', value: overview.userCount },
    { label: 'Organizations', value: overview.organizationCount },
    { label: 'Projects', value: overview.projectCount },
    { label: 'Published pages', value: overview.publishedPageCount },
    { label: 'Templates', value: overview.templateCount },
    { label: 'Media assets', value: overview.mediaAssetCount },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Overview
        </h1>
        <p className="text-muted-foreground mt-1">
          Platform-wide counts across every tenant.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-normal">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {stat.value}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
