import { getActiveOrganization } from '@/server/services/organizationService'
import { listTaxRates } from '@/server/services/shippingService'
import { TaxSettings } from '@/components/store/shipping-settings'

export default async function TaxSettingsPage() {
  const { organization } = await getActiveOrganization()
  const rates = await listTaxRates(organization.id)

  return (
    <TaxSettings
      rates={rates.map((rate) => ({
        id: rate.id,
        name: rate.name,
        countryCode: rate.countryCode,
        provinceCode: rate.provinceCode,
        rateBps: rate.rateBps,
        appliesToShipping: rate.appliesToShipping,
      }))}
    />
  )
}
