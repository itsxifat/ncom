import { getActiveOrganization } from '@/server/services/organizationService'
import { listPaymentProviders } from '@/server/services/shippingService'
import { PaymentSettings } from '@/components/store/payment-settings'

export default async function PaymentSettingsPage() {
  const { organization } = await getActiveOrganization()

  // listPaymentProviders returns masked previews only — decrypted secrets are
  // never sent to the client.
  const configured = await listPaymentProviders(organization.id)

  return <PaymentSettings configured={configured} />
}
