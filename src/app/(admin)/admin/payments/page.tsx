import { env } from '@/lib/env'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { getEnfinitoPayStatus } from '@/server/services/enfinitoPaySettingsService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { StatCard } from '@/components/app/stat-card'
import { EnfinitoPaySettingsClient } from './EnfinitoPaySettingsClient'

export const metadata = { title: 'Payments' }

export default async function AdminPaymentsPage() {
  await requirePlatformAdmin()
  const status = await getEnfinitoPayStatus()
  const base = env.AUTH_URL.replace(/\/$/, '')

  return (
    <PageShell>
      <PageHeader
        eyebrow="Configuration"
        title="Payments"
        description="How workspaces pay NCOM for plans, add-ons and AI credits: Enfinito Pay, and nothing else. A store's own customers pay with the methods its owner sets up — none of that is here."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Enfinito Pay"
          value={
            status.mode === 'live'
              ? 'Live'
              : status.mode === 'test'
                ? 'Test mode'
                : 'Not connected'
          }
          hint={
            status.mode === 'test'
              ? 'Test payments only — no real money moves.'
              : status.mode === null
                ? 'Paid orders wait for your team.'
                : undefined
          }
        />
        <StatCard
          label="Webhook"
          value={status.webhookSecret.source ? 'Signed' : 'Not set'}
          hint={
            status.webhookSecret.source
              ? undefined
              : 'Payments are still confirmed when owners return.'
          }
        />
      </div>

      <EnfinitoPaySettingsClient
        status={status}
        webhookUrl={`${base}/api/billing/enfinito-pay`}
        returnDomain={new URL(base).host}
      />
    </PageShell>
  )
}
