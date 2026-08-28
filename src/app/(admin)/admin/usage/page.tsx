import Link from 'next/link'
import { Activity } from 'lucide-react'
import { getPlatformUsage } from '@/server/services/planAdminService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { StatCard } from '@/components/app/stat-card'
import { Badge } from '@/components/ui/badge'
import { formatBytes, usagePeriodKey } from '@/lib/plans'

export const metadata = { title: 'Usage' }

export default async function AdminUsagePage() {
  const rows = await getPlatformUsage()
  const period = usagePeriodKey()

  const totals = rows.reduce(
    (accumulator, row) => ({
      storage: accumulator.storage + row.storageBytes,
      traffic: accumulator.traffic + row.trafficBytes,
      visitors: accumulator.visitors + row.visitors,
      pages: accumulator.pages + row.pages,
    }),
    { storage: 0, traffic: 0, visitors: 0, pages: 0 }
  )

  // Busiest first: this page is read when something is wrong, and the tenant
  // causing it is almost always at the top of one of these columns.
  const sorted = [...rows].sort((a, b) => b.trafficBytes - a.trafficBytes)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Monetization"
        title="Usage"
        description={`What every workspace is consuming. Traffic and visitors cover ${period} and reset next month; pages, storage and domains are counted live.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Stored media" value={formatBytes(totals.storage)} />
        <StatCard
          label={`Traffic (${period})`}
          value={formatBytes(totals.traffic)}
        />
        <StatCard
          label={`Visitors (${period})`}
          value={new Intl.NumberFormat('en-US').format(totals.visitors)}
        />
        <StatCard label="Landing pages" value={String(totals.pages)} />
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nothing to report"
          description="Usage appears here once workspaces start publishing."
        />
      ) : (
        <ListPanel>
          {sorted.map((row) => (
            <ListRow key={row.organizationId}>
              <ListRowText
                title={
                  <Link
                    href={`/admin/subscriptions/${row.organizationId}`}
                    className="hover:underline"
                  >
                    {row.organizationName}
                  </Link>
                }
                meta={
                  <>
                    {row.pages} pages · {row.stores} sites · {row.domains}{' '}
                    domains · {row.members} members
                  </>
                }
                badges={
                  <>
                    <Badge variant="outline">{row.planName}</Badge>
                    {row.quotaEnforcementDisabled && (
                      <Badge variant="destructive">Limits waived</Badge>
                    )}
                  </>
                }
              />
              <ListRowActions>
                <div className="text-right text-xs">
                  <p className="font-mono">
                    {formatBytes(row.storageBytes)} stored
                  </p>
                  <p className="text-muted-foreground font-mono">
                    {formatBytes(row.trafficBytes)} · {row.visitors} visitors
                  </p>
                </div>
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
