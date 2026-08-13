import { getActiveOrganization } from '@/server/services/organizationService'
import {
  listWebhookDeliveries,
  listWebhookEndpoints,
  WEBHOOK_TOPICS,
} from '@/server/services/webhookService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { WebhookManager } from '@/components/dashboard/webhook-manager'

export default async function WebhooksPage() {
  const { organization } = await getActiveOrganization()

  const [endpoints, deliveries] = await Promise.all([
    listWebhookEndpoints(organization.id),
    listWebhookDeliveries(organization.id, { take: 25 }),
  ])

  return (
    <PageShell>
      <PageHeader
        title="Webhooks"
        description="Push stock, product and order changes to another system the moment they happen."
      />

      <WebhookManager
        topics={WEBHOOK_TOPICS}
        endpoints={endpoints.map((endpoint) => ({
          id: endpoint.id,
          url: endpoint.url,
          description: endpoint.description,
          topics: endpoint.topics,
          isActive: endpoint.isActive,
          consecutiveFailures: endpoint.consecutiveFailures,
          lastSuccessAt: endpoint.lastSuccessAt?.toISOString() ?? null,
          lastFailureAt: endpoint.lastFailureAt?.toISOString() ?? null,
          lastErrorMessage: endpoint.lastErrorMessage,
          succeeded: endpoint.succeeded,
          failed: endpoint.failed,
          pending: endpoint.pending,
        }))}
        deliveries={deliveries.map((delivery) => ({
          id: delivery.id,
          topic: delivery.topic,
          eventId: delivery.eventId,
          status: delivery.status,
          attempts: delivery.attempts,
          statusCode: delivery.statusCode,
          error: delivery.error,
          createdAt: delivery.createdAt.toISOString(),
          url: delivery.webhook.url,
        }))}
      />
    </PageShell>
  )
}
