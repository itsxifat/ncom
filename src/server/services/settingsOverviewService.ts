import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { currencySymbol } from '@/lib/money'

export interface SettingStatus {
  text: string
  /**
   * `ok` is set up and working, `todo` is worth doing and not done, `plain` is
   * a fact with no judgement in it ("2 people", "Off" for taxes nobody owes).
   */
  tone: 'ok' | 'todo' | 'plain'
}

const COURIER_NAME = { STEADFAST: 'Steadfast', PATHAO: 'Pathao' } as const

/**
 * One line of state per setting, for the Settings page — keyed by the
 * setting's href in `SETTINGS_GROUPS`.
 *
 * The point of the line is that a merchant can tell from the list what is
 * missing without opening ten screens to look. So it says what is true now
 * ("Steadfast connected", "Not connected") rather than repeating what the
 * setting is for, and it marks as `todo` only what a working shop actually
 * needs; taxes that are off are not a problem, and the list does not pretend
 * they are.
 */
export async function getSettingsOverview(
  organizationId: string
): Promise<Record<string, SettingStatus>> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const [
    settings,
    members,
    subscription,
    payments,
    taxes,
    couriers,
    zones,
    locations,
    connection,
    destination,
    pixels,
    apiKeys,
    webhooks,
  ] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true, currencyConfiguredAt: true },
    }),
    prisma.membership.count({ where: { organizationId } }),
    prisma.subscription.findUnique({
      where: { organizationId },
      select: { plan: { select: { name: true } } },
    }),
    prisma.paymentProviderConfig.count({
      where: { organizationId, isEnabled: true },
    }),
    prisma.taxRate.count({ where: { organizationId } }),
    prisma.courierConfig.findMany({
      where: { organizationId, isEnabled: true },
      select: { provider: true },
      orderBy: { position: 'asc' },
    }),
    prisma.shippingZone.count({ where: { organizationId } }),
    prisma.location.count({ where: { organizationId } }),
    prisma.catalogConnection.count({ where: { organizationId } }),
    prisma.orderDestination.findUnique({
      where: { organizationId },
      select: { mode: true },
    }),
    prisma.storeIntegrationConfig.count({
      where: {
        store: { organizationId },
        OR: [
          { metaPixelId: { not: null } },
          { gaMeasurementId: { not: null } },
        ],
      },
    }),
    prisma.apiKey.count({ where: { organizationId, revokedAt: null } }),
    prisma.webhookEndpoint.count({ where: { organizationId } }),
  ])

  const currency = settings?.currencyCode ?? 'USD'
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`

  return {
    '/settings/business': settings?.currencyConfiguredAt
      ? {
          text: `Selling in ${currency} (${currencySymbol(currency)})`,
          tone: 'plain',
        }
      : { text: 'Choose your currency', tone: 'todo' },
    '/organization': {
      text: plural(members, 'person', 'people'),
      tone: 'plain',
    },
    '/billing': {
      text: subscription ? `${subscription.plan.name} plan` : 'No plan yet',
      tone: subscription ? 'plain' : 'todo',
    },
    '/settings/payments': payments
      ? { text: `${plural(payments, 'way', 'ways')} to pay`, tone: 'ok' }
      : { text: 'Nothing turned on', tone: 'todo' },
    '/settings/taxes': taxes
      ? { text: plural(taxes, 'rate', 'rates'), tone: 'plain' }
      : { text: 'Off', tone: 'plain' },
    '/settings/courier': couriers.length
      ? {
          text: `${couriers.map((c) => COURIER_NAME[c.provider]).join(' & ')} connected`,
          tone: 'ok',
        }
      : { text: 'Not connected', tone: 'todo' },
    '/settings/shipping': zones
      ? {
          text: plural(zones, 'delivery zone', 'delivery zones'),
          tone: 'plain',
        }
      : { text: 'Not set up', tone: 'todo' },
    '/settings/locations': {
      text: plural(locations, 'location', 'locations'),
      tone: 'plain',
    },
    '/settings/product-source': connection
      ? { text: 'Connected', tone: 'ok' }
      : { text: 'Not connected', tone: 'plain' },
    '/settings/order-destination': {
      text:
        destination?.mode === 'OWN_WEBSITE'
          ? 'Sent to your website'
          : 'Handled here',
      tone: 'plain',
    },
    '/tracking': pixels
      ? { text: 'Set up', tone: 'ok' }
      : { text: 'Not set up', tone: 'todo' },
    '/settings/api-keys': {
      text: apiKeys ? plural(apiKeys, 'key', 'keys') : 'None',
      tone: 'plain',
    },
    '/settings/webhooks': {
      text: webhooks ? plural(webhooks, 'endpoint', 'endpoints') : 'None',
      tone: 'plain',
    },
  }
}
