import { z } from 'zod'
import { apiOk, readJson, withApiKey } from '@/server/api/context'
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  topicWireName,
  WEBHOOK_TOPICS,
} from '@/server/services/webhookService'
import type { WebhookTopic } from '@/generated/prisma/client'

/**
 * `GET  /api/v1/webhooks` — the endpoints this organisation has registered.
 * `POST /api/v1/webhooks` — register one.
 *
 * Registerable over the API so an integration can install its own endpoint at
 * setup time. An app that makes the merchant paste a URL into two dashboards to
 * finish connecting has a setup step that half of them will get wrong.
 *
 * Topics are given on the wire in their dotted form (`product.updated`) — the
 * same strings that arrive in the payload — rather than the enum names, so a
 * caller never has to know two vocabularies for one concept.
 */

const wireToTopic = new Map(
  WEBHOOK_TOPICS.map((entry) => [entry.wire, entry.topic])
)

const createSchema = z.object({
  url: z.string().min(1),
  description: z.string().trim().max(300).optional(),
  topics: z
    .array(z.string())
    .min(1, 'Subscribe to at least one topic')
    .transform((topics, ctx) => {
      const resolved: WebhookTopic[] = []
      for (const topic of topics) {
        const match = wireToTopic.get(topic.trim().toLowerCase())
        if (!match) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown topic "${topic}". See GET /api/v1/webhooks/topics.`,
          })
          continue
        }
        resolved.push(match)
      }
      return resolved
    }),
})

export async function GET() {
  return withApiKey('WEBHOOKS_READ', async ({ organizationId }) => {
    const endpoints = await listWebhookEndpoints(organizationId)

    return apiOk({
      data: endpoints.map((endpoint) => ({
        id: endpoint.id,
        url: endpoint.url,
        description: endpoint.description,
        topics: endpoint.topics.map(topicWireName),
        isActive: endpoint.isActive,
        deliveries: {
          succeeded: endpoint.succeeded,
          failed: endpoint.failed,
          pending: endpoint.pending,
        },
        lastSuccessAt: endpoint.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: endpoint.lastFailureAt?.toISOString() ?? null,
        createdAt: endpoint.createdAt.toISOString(),
      })),
    })
  })
}

export async function POST(request: Request) {
  return withApiKey('WEBHOOKS_WRITE', async ({ organizationId }) => {
    const body = await readJson(request, createSchema)
    if (!body.ok) return body.response

    const { endpoint, secret } = await createWebhookEndpoint(organizationId, {
      url: body.data.url,
      description: body.data.description ?? null,
      topics: body.data.topics,
    })

    return apiOk(
      {
        data: {
          id: endpoint.id,
          url: endpoint.url,
          topics: endpoint.topics.map(topicWireName),
          // Returned once and never again. Store it now — it is what verifies
          // that a delivery came from us.
          secret,
        },
      },
      201
    )
  })
}

export const runtime = 'nodejs'
