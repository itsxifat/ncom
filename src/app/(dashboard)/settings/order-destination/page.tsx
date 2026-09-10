import Link from 'next/link'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrderDestinationStatus } from '@/server/orders'
import { getConnectionStatus } from '@/server/catalog'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { OrderDestinationManager } from '@/components/dashboard/order-destination-manager'

export default async function OrderDestinationPage() {
  const { organization } = await getActiveOrganization()

  const [status, connection] = await Promise.all([
    getOrderDestinationStatus(organization.id),
    getConnectionStatus(organization.id),
  ])

  return (
    <PageShell>
      <PageHeader
        title="Where orders are processed"
        description="An order from a landing page can be worked here, or handed straight to the website you already run. Pick one — it applies to every store and every page in this workspace."
      />

      <OrderDestinationManager
        hasCatalogConnection={connection !== null}
        status={{
          mode: status.mode,
          purchaseReporting: status.purchaseReporting,
          endpointUrl: status.endpointUrl,
          keyId: status.keyId,
          secretHint: status.secretHint,
          timeoutMs: status.timeoutMs,
          lastCheckedAt: status.lastCheckedAt?.toISOString() ?? null,
          lastOkAt: status.lastOkAt?.toISOString() ?? null,
          lastError: status.lastError,
        }}
      />

      <p className="text-muted-foreground text-sm">
        The endpoint is one route on your side that verifies a signature and
        writes an order —{' '}
        <Link href="/docs#order-destination" className="underline">
          the contract and a copy-paste implementation are in the docs
        </Link>
        . Orders already placed are not moved by changing this: the switch
        applies to what happens next.
      </p>
    </PageShell>
  )
}
