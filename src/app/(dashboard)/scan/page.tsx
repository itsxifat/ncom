import { getActiveOrganization } from '@/server/services/organizationService'
import { listStores } from '@/server/services/storeService'
import { PageHeader } from '@/components/app/page-header'
import { OrderScanner } from '@/components/store/order-scanner'

export const metadata = { title: 'Scan' }

/**
 * The packing table's way into an order.
 *
 * A parcel in hand carries a number; finding it by scrolling the order list is
 * the slow way to do forty of them. Scanning the sticker — or the courier's own
 * label, whose consignment id is matched too — opens the order directly, where
 * the status, the address and the items are.
 */
export default async function ScanPage() {
  const { organization } = await getActiveOrganization()
  const stores = await listStores(organization.id)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Fulfilment"
        title="Scan"
        description="Scan a parcel sticker to open its order. Works with a barcode gun or a phone camera."
      />

      <OrderScanner
        stores={stores.map((store) => ({ id: store.id, name: store.name }))}
      />
    </div>
  )
}
