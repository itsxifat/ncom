import Link from 'next/link'
import { Globe2 } from 'lucide-react'
import { listAllDomains, domainTargets } from '@/server/services/domainService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { DomainRowActions } from './DomainRowActions'

export const metadata = { title: 'Domains' }

const STATUS_VARIANT: Record<string, 'secondary' | 'outline' | 'destructive'> =
  {
    VERIFIED: 'secondary',
    PENDING: 'outline',
    FAILED: 'destructive',
  }

export default async function AdminDomainsPage() {
  const domains = await listAllDomains()
  const targets = domainTargets()

  const pending = domains.filter(
    (domain) => domain.status !== 'VERIFIED'
  ).length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Platform"
        title="Custom domains"
        description={
          <>
            {domains.length} connected
            {pending > 0 && `, ${pending} awaiting verification`}. Tenants point
            a CNAME at{' '}
            <span className="font-mono text-xs">{targets.cnameTarget}</span>
            {targets.aRecordIp && (
              <>
                {' '}
                or an A record at{' '}
                <span className="font-mono text-xs">{targets.aRecordIp}</span>
              </>
            )}
            .
          </>
        }
      />

      {!targets.aRecordIp && (
        <p className="bg-muted text-muted-foreground rounded-xl p-3 text-xs">
          <strong className="text-foreground">
            DOMAIN_TARGET_IP is not set.
          </strong>{' '}
          Apex domains cannot hold a CNAME, so without an ingress IP those
          tenants are told to use an ALIAS/ANAME record at their provider
          instead.
        </p>
      )}

      {domains.length === 0 ? (
        <EmptyState
          icon={Globe2}
          title="No custom domains"
          description="They appear here as soon as a tenant connects one."
        />
      ) : (
        <ListPanel>
          {domains.map((domain) => (
            <ListRow key={domain.id}>
              <ListRowText
                title={
                  <span className="font-mono text-sm">{domain.hostname}</span>
                }
                meta={
                  <>
                    <Link
                      href={`/admin/subscriptions/${domain.organization.id}`}
                      className="hover:underline"
                    >
                      {domain.organization.name}
                    </Link>{' '}
                    · {domain.store.name} ({domain.store.subdomain}) ·{' '}
                    {domain.recordType} record
                    {domain.lastCheckedAt &&
                      ` · checked ${domain.lastCheckedAt.toLocaleString()}`}
                  </>
                }
                badges={
                  <>
                    <Badge variant={STATUS_VARIANT[domain.status] ?? 'outline'}>
                      {domain.status.toLowerCase()}
                    </Badge>
                    {domain.isPrimary && (
                      <Badge variant="outline">Primary</Badge>
                    )}
                  </>
                }
              />
              <ListRowActions>
                <DomainRowActions
                  domainId={domain.id}
                  hostname={domain.hostname}
                  status={domain.status}
                />
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
