import { getActiveOrganization } from '@/server/services/organizationService'
import { listLocations } from '@/server/services/shippingService'
import { LocationSettings } from '@/components/store/shipping-settings'

export default async function LocationSettingsPage() {
  const { organization } = await getActiveOrganization()
  const locations = await listLocations(organization.id)

  return (
    <LocationSettings
      locations={locations.map((location) => ({
        id: location.id,
        name: location.name,
        isActive: location.isActive,
      }))}
    />
  )
}
