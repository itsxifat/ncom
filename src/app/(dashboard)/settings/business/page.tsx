import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { prisma } from '@/server/db/client'
import { EmptyState } from '@/components/app/empty-state'
import { StoreSettingsForm } from '@/components/store/store-settings-form'
import { Store } from 'lucide-react'

/**
 * Who the business is and what it sells in: name and contact details for
 * receipts, the currency every price is written in, and how orders are
 * numbered.
 *
 * The form existed from the first version of the workspace but was never
 * mounted on any page, so a workspace had no way to leave the USD default —
 * and every price in a taka shop read "$". It lives here, at the top of
 * Settings, because it is the first thing a new shop has to get right.
 */
export default async function BusinessSettingsPage() {
  const { organization } = await getActiveOrganization()

  const [settings, orderCount] = await Promise.all([
    getOrganizationSettings(organization.id),
    // Currency and the tax basis are written into every order, so they lock
    // once there is one; the service refuses the change either way, and the
    // form says so up front instead of failing on save.
    prisma.order.count({ where: { organizationId: organization.id } }),
  ])

  if (!settings) {
    return (
      <EmptyState
        icon={Store}
        title="This workspace has no shop yet"
        description="Create a website first; its business settings appear here once it can take orders."
      />
    )
  }

  return (
    <StoreSettingsForm
      locked={orderCount > 0}
      settings={{
        currencyCode: settings.currencyCode,
        weightUnit: settings.weightUnit,
        pricesIncludeTax: settings.pricesIncludeTax,
        taxesIncludedInShipping: settings.taxesIncludedInShipping,
        customerAccountsEnabled: settings.customerAccountsEnabled,
        requiresCustomerAccount: settings.requiresCustomerAccount,
        allowOutOfStockPurchase: settings.allowOutOfStockPurchase,
        orderNumberPrefix: settings.orderNumberPrefix,
        orderNumberSuffix: settings.orderNumberSuffix,
        supportEmail: settings.supportEmail ?? '',
        supportPhone: settings.supportPhone ?? '',
        businessName: settings.businessName ?? '',
      }}
    />
  )
}
