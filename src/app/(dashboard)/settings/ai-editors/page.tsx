import { env } from '@/lib/env'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listApiKeys } from '@/server/services/apiKeyService'
import { PageShell } from '@/components/app/page-shell'
import { AiEditorConnect } from '@/components/dashboard/ai-editor-connect'

/**
 * Settings → AI code editors: connect Cursor, Claude Code, VS Code or
 * Windsurf to this workspace over MCP, and see what is connected.
 */
export default async function AiEditorsPage() {
  const { organization, role } = await getActiveOrganization()
  const canManage = role === 'OWNER' || role === 'ADMIN'

  // Keys are an admin's business; anyone else is shown how it works and who
  // to ask, rather than an error.
  const keys = canManage ? await listApiKeys(organization.id) : []
  const connections = keys
    .filter((key) => key.scopes.includes('SITES_READ') && !key.revokedAt)
    .map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      canWrite: key.scopes.includes('SITES_WRITE'),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    }))

  return (
    <PageShell>
      <AiEditorConnect
        mcpUrl={new URL('/api/mcp', env.AUTH_URL).toString()}
        canManage={canManage}
        connections={connections}
      />
    </PageShell>
  )
}
