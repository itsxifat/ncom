import {
  AI_ACTION_LABELS,
  AI_MODELS,
  getAiConfig,
  getAiKeyStatus,
} from '@/server/services/aiSettingsService'
import { platformCreditUsageThisMonth } from '@/server/services/aiCreditService'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { StatCard } from '@/components/app/stat-card'
import { AiSettingsClient } from './AiSettingsClient'

export const metadata = { title: 'AI builder' }

export default async function AdminAiPage() {
  await requirePlatformAdmin()
  const [key, config, usage] = await Promise.all([
    getAiKeyStatus(),
    getAiConfig(),
    platformCreditUsageThisMonth(),
  ])
  const live = Boolean(key.source) && config.enabled

  return (
    <PageShell>
      <PageHeader
        eyebrow="Configuration"
        title="AI builder"
        description="Connect your Claude account and set how the AI builder is offered. Workspaces pay for it in AI credits; they never see these settings."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Status"
          value={live ? 'On' : key.source ? 'Switched off' : 'Not connected'}
        />
        <StatCard
          label="Credits used this month"
          value={usage.used.toLocaleString()}
          hint="Across every workspace, after refunds"
        />
        <StatCard
          label="AI requests this month"
          value={usage.requests.toLocaleString()}
        />
      </div>

      <AiSettingsClient
        data={{
          key,
          config,
          models: AI_MODELS.map((model) => ({ ...model })),
          actionLabels: AI_ACTION_LABELS,
        }}
      />
    </PageShell>
  )
}
