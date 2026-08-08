import { listPlatformSettings } from '@/server/services/adminService'
import { SettingsClient } from './SettingsClient'

export default async function AdminSettingsPage() {
  const settings = await listPlatformSettings()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Platform settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Generic key/value store for platform-wide configuration.
        </p>
      </div>
      <SettingsClient
        settings={settings.map((s) => ({
          key: s.key,
          value: s.value,
          updatedAt: s.updatedAt.toISOString(),
        }))}
      />
    </div>
  )
}
