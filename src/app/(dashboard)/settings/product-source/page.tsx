import Link from 'next/link'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { getConnectionStatus } from '@/server/catalog'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { ProductSourceManager } from '@/components/dashboard/product-source-manager'

export default async function ProductSourcePage() {
  const { organization } = await getActiveOrganization()

  const [status, settings] = await Promise.all([
    getConnectionStatus(organization.id),
    getOrganizationSettings(organization.id),
  ])

  return (
    <PageShell>
      <PageHeader
        title="Product source"
        description="Connect the website you already sell from. Its products, prices, photos and stock are read live on every request and never copied here — and they sit alongside any products you add in NCOM."
      />

      <ProductSourceManager
        currencyCode={settings?.currencyCode ?? 'BDT'}
        status={
          status
            ? {
                baseUrl: status.baseUrl,
                keyId: status.keyId,
                secretHint: status.secretHint,
                timeoutMs: status.timeoutMs,
                capabilities: { ...status.capabilities },
                platform: status.platform,
                currencyCode: status.currencyCode,
                lastCheckedAt: status.lastCheckedAt?.toISOString() ?? null,
                lastOkAt: status.lastOkAt?.toISOString() ?? null,
                lastError: status.lastError,
              }
            : null
        }
      />

      <p className="text-muted-foreground text-sm">
        Building the connector is a single file on your side —{' '}
        <Link href="/docs#product-source" className="underline">
          the contract and copy-paste implementations are in the docs
        </Link>
        . You do not need one to sell:{' '}
        <Link href="/products/new" className="underline">
          products added in NCOM
        </Link>{' '}
        work without any of this.
      </p>
    </PageShell>
  )
}
