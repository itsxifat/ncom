import { getActiveOrganization } from '@/server/services/organizationService'
import { API_SCOPES, listApiKeys } from '@/server/services/apiKeyService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { ApiKeyManager } from '@/components/dashboard/api-key-manager'

export default async function ApiKeysPage() {
  const { organization } = await getActiveOrganization()
  const keys = await listApiKeys(organization.id)

  return (
    <PageShell>
      <PageHeader
        title="API keys"
        description="Credentials for reading and writing this workspace's catalogue, stock and orders from another system."
      />

      <ApiKeyManager
        scopes={API_SCOPES}
        keys={keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          last4: key.last4,
          scopes: key.scopes,
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          expiresAt: key.expiresAt?.toISOString() ?? null,
          revokedAt: key.revokedAt?.toISOString() ?? null,
          createdAt: key.createdAt.toISOString(),
          createdByName: key.createdBy?.name ?? key.createdBy?.email ?? null,
          isExpired: key.isExpired,
        }))}
      />
    </PageShell>
  )
}
