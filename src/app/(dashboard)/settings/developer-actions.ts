'use server'

/**
 * API key and webhook management, from the dashboard.
 *
 * Kept apart from commerce-actions because these govern *access* to the
 * catalogue rather than its contents, and everything here is admin-only.
 */

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  createApiKey,
  deleteApiKey,
  revokeApiKey,
} from '@/server/services/apiKeyService'
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  redeliverWebhook,
  rotateWebhookSecret,
  sendTestEvent,
  updateWebhookEndpoint,
} from '@/server/services/webhookService'
import type { ApiScope, WebhookTopic } from '@/generated/prisma/client'

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong'
}

/**
 * Creates a key and hands back the plaintext.
 *
 * This is the only moment the token exists outside a hash, so the caller has to
 * show it immediately and say so — there is no second chance to fetch it.
 */
export async function createApiKeyAction(
  name: string,
  scopes: ApiScope[],
  expiresInDays: number | null
): Promise<
  { ok: true; token: string; prefix: string } | { ok: false; error: string }
> {
  try {
    const { organization, session } = await getActiveOrganization()
    const { key, token } = await createApiKey(
      organization.id,
      {
        name,
        scopes,
        expiresAt: expiresInDays
          ? new Date(Date.now() + expiresInDays * 86_400_000)
          : null,
      },
      session.user.id
    )

    revalidatePath('/settings/api-keys')
    return { ok: true, token, prefix: key.prefix }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function revokeApiKeyAction(keyId: string) {
  try {
    await revokeApiKey(await org(), keyId)
    revalidatePath('/settings/api-keys')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: message(cause) }
  }
}

export async function deleteApiKeyAction(keyId: string) {
  try {
    await deleteApiKey(await org(), keyId)
    revalidatePath('/settings/api-keys')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: message(cause) }
  }
}

export async function createWebhookAction(
  url: string,
  topics: WebhookTopic[],
  description: string
): Promise<
  { ok: true; secret: string; id: string } | { ok: false; error: string }
> {
  try {
    const { endpoint, secret } = await createWebhookEndpoint(await org(), {
      url,
      topics,
      description,
    })

    revalidatePath('/settings/webhooks')
    return { ok: true, secret, id: endpoint.id }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function updateWebhookAction(
  webhookId: string,
  input: { url?: string; topics?: WebhookTopic[]; isActive?: boolean }
) {
  try {
    await updateWebhookEndpoint(await org(), webhookId, input)
    revalidatePath('/settings/webhooks')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: message(cause) }
  }
}

export async function deleteWebhookAction(webhookId: string) {
  try {
    await deleteWebhookEndpoint(await org(), webhookId)
    revalidatePath('/settings/webhooks')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: message(cause) }
  }
}

export async function rotateWebhookSecretAction(
  webhookId: string
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  try {
    const secret = await rotateWebhookSecret(await org(), webhookId)
    revalidatePath('/settings/webhooks')
    return { ok: true, secret }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

/** Fires a real, signed delivery so the merchant can see it arrive — or not. */
export async function testWebhookAction(webhookId: string) {
  try {
    const result = await sendTestEvent(await org(), webhookId)
    revalidatePath('/settings/webhooks')

    return {
      ok: true as const,
      succeeded: result.status === 'SUCCEEDED',
      statusCode: result.statusCode,
      error: result.error,
    }
  } catch (cause) {
    return { ok: false as const, error: message(cause) }
  }
}

export async function redeliverWebhookAction(deliveryId: string) {
  try {
    await redeliverWebhook(await org(), deliveryId)
    revalidatePath('/settings/webhooks')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: message(cause) }
  }
}
