import { listPlatformSettings } from '@/server/services/adminService'
import {
  PLATFORM_FLAGS,
  PLATFORM_FLAG_KEYS,
  getPlatformFlags,
} from '@/server/services/platformFlagService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import { PlatformFlags, type FlagRow } from './PlatformFlags'
import { SettingsClient } from './SettingsClient'
import { SiteContactForm } from './SiteContactForm'
import { getSiteContact } from '@/server/services/siteContactService'

export default async function AdminSettingsPage() {
  const [settings, flags, contact] = await Promise.all([
    listPlatformSettings(),
    getPlatformFlags(),
    getSiteContact(),
  ])

  const flagRows: FlagRow[] = PLATFORM_FLAG_KEYS.map((key) => ({
    key,
    label: PLATFORM_FLAGS[key].label,
    description: PLATFORM_FLAGS[key].description,
    group: PLATFORM_FLAGS[key].group,
    value: flags[key],
  }))

  // The named switches are listed first: they are what an operator actually
  // comes here to change. The raw key/value editor stays underneath as the
  // escape hatch it was built to be.
  return (
    <PageShell>
      <PageHeader
        eyebrow="Configuration"
        title="Platform settings"
        description="How authentication, billing and limit enforcement behave platform-wide. Changes apply on the next request."
      />

      <PlatformFlags flags={flagRows} />

      <SettingsSection
        title="Site contact"
        description="How people reach NCOM. Shown in the public site's footer, on the Contact page, on the Enterprise package and in the legal pages. Leave a field empty to keep it off the site."
      >
        <SiteContactForm values={contact} />
      </SettingsSection>

      <SettingsSection
        title="Raw settings"
        description="Arbitrary key/value configuration, stored as JSON. The switches above live in this table too — edit them there, not here."
      >
        <SettingsClient
          settings={settings.map((s) => ({
            key: s.key,
            value: s.value,
            updatedAt: s.updatedAt.toISOString(),
          }))}
        />
      </SettingsSection>
    </PageShell>
  )
}
