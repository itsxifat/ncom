import { z } from 'zod'
import { apiOk, readJson, withApiKey } from '@/server/api/context'
import {
  deleteWebhookEndpoint,
  updateWebhookEndpoint,
  WEBHOOK_TOPICS,
} from '@/server/services/webhookService'
import type { WebhookTopic } from '@/generated/prisma/client'

const wireToTopic = new Map(
  WEBHOOK_TOPICS.map((entry) => [entry.wire, entry.topic])
)

const updateSchema = z.object({
  url: z.string().min(1).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
  topics: z
    .array(z.string())
    .min(1)
    .optional()
    .transform((topics, ctx) => {
      if (!topics) return undefined
      const resolved: WebhookTopic[] = []
      for (const topic of topics) {
        const match = wireToTopic.get(topic.trim().toLowerCase())
        if (!match) {
          ctx.addIssue({ code: 'custom', message: `Unknown topic "${topic}".` })
          continue
        }
        resolved.push(match)
      }
      return resolved
    }),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  return withApiKey('WEBHOOKS_WRITE', async ({ organizationId }) => {
    const { webhookId } = await params
    const body = await readJson(request, updateSchema)
    if (!body.ok) return body.response

    await updateWebhookEndpoint(organizationId, webhookId, body.data)
    return apiOk({ data: { id: webhookId, updated: true } })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  return withApiKey('WEBHOOKS_WRITE', async ({ organizationId }) => {
    const { webhookId } = await params
    await deleteWebhookEndpoint(organizationId, webhookId)
    return apiOk({ data: { id: webhookId, deleted: true } })
  })
}

export const runtime = 'nodejs'
