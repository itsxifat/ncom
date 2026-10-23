'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import { createApiKey, revokeApiKey } from '@/server/services/apiKeyService'
import type { ApiScope } from '@/generated/prisma/client'

/**
 * Connecting an AI code editor is making an API key with the website
 * permissions and nothing else — so a connection can read and draft pages but
 * never touch orders, products or other keys, and disconnecting it is revoking
 * that key.
 */

const EDITOR_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  vscode: 'VS Code',
  windsurf: 'Windsurf',
  'claude-desktop': 'Claude Desktop',
  other: 'AI editor',
}

export async function connectEditorAction(
  editor: string,
  canWrite: boolean
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const { organization, session } = await getActiveOrganization()
    const scopes: ApiScope[] = canWrite
      ? ['SITES_READ', 'SITES_WRITE']
      : ['SITES_READ']
    const { token } = await createApiKey(
      organization.id,
      {
        name: `${EDITOR_NAMES[editor] ?? 'AI editor'} (MCP)`,
        scopes,
      },
      session.user.id
    )
    revalidatePath('/settings/ai-editors')
    revalidatePath('/settings/api-keys')
    return { ok: true, token }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Something went wrong',
    }
  }
}

export async function disconnectEditorAction(
  keyId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { organization } = await getActiveOrganization()
    await revokeApiKey(organization.id, keyId)
    revalidatePath('/settings/ai-editors')
    revalidatePath('/settings/api-keys')
    return { ok: true }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Something went wrong',
    }
  }
}
