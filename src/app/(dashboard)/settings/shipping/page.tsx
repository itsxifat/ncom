import { getActiveOrganization } from '@/server/services/organizationService'
import { listShippingZones } from '@/server/services/shippingService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { ShippingSettings } from '@/components/store/shipping-settings'

export default async function ShippingSettingsPage() {
  const { organization } = await getActiveOrganization()

  const [zones, settings] = await Promise.all([
    listShippingZones(organization.id),
    getOrganizationSettings(organization.id),
  ])

  return (
    <ShippingSettings
      currencyCode={settings?.currencyCode ?? 'USD'}
      zones={zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        countryCodes: zone.countryCodes,
        rates: zone.rates.map((rate) => ({
          id: rate.id,
          name: rate.name,
          description: rate.description,
          priceCents: rate.priceCents,
          minSubtotalCents: rate.minSubtotalCents,
          maxSubtotalCents: rate.maxSubtotalCents,
        })),
      }))}
    />
  )
}
