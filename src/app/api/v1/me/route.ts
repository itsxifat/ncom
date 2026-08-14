import { apiOk, withApiKey } from '@/server/api/context'
import { prisma } from '@/server/db/client'

/**
 * `GET /api/v1/me` — who this key is, and what it may do.
 *
 * The first call anyone makes. It answers "is my key working, is it pointed at
 * the right store, and does it have the permissions I think it has" in one
 * request, without touching any data — which is exactly the check to put at the
 * top of a setup script, and the one to ask someone to run when their
 * integration returns 403 and they cannot tell why.
 *
 * Requires only PRODUCTS_READ so it is reachable by the narrowest useful key.
 */
export async function GET() {
  return withApiKey('PRODUCTS_READ', async ({ organizationId, key }) => {
    const [organization, settings] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.organizationSettings.findUnique({
        where: { organizationId },
        select: {
          currencyCode: true,
          weightUnit: true,
          currencyConfiguredAt: true,
        },
      }),
    ])

    return apiOk({
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          currencyCode: settings?.currencyCode ?? 'USD',
          // False while the workspace is still on the default nobody chose.
          // Worth checking before a first import: prices are bare minor units,
          // so a wrong currency corrupts every one of them silently.
          currencyConfigured: Boolean(settings?.currencyConfiguredAt),
          // A display preference for the dashboard. Variant weights are always
          // sent and returned in grams as `weightGrams`, whatever this says.
          weightUnit: settings?.weightUnit ?? 'KILOGRAM',
          weightsAreAlwaysInGrams: true,
        },
        key: {
          id: key.id,
          name: key.name,
          scopes: key.scopes,
        },
      },
    })
  })
}

export const runtime = 'nodejs'
