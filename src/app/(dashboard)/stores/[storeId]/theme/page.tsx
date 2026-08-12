import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getStoreTheme } from '@/server/services/storeService'
import { PageHeader } from '@/components/app/page-header'
import { SettingsSection } from '@/components/app/settings-section'
import { ThemeForm } from '@/components/dashboard/theme-form'
import { updateThemeAction } from './actions'

export default async function StoreThemePage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params
  const { organization } = await getActiveOrganization()

  let theme
  try {
    theme = await getStoreTheme(organization.id, storeId)
  } catch {
    notFound()
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/stores/${storeId}`}
        backLabel="Back to store"
        eyebrow="Store"
        title="Theme"
        description="Colors, type, and spacing applied to every page in this store."
      />
      <SettingsSection
        title="Global styling"
        description="Changes here show up on every page the next time you publish."
      >
        <ThemeForm
          logoUrl={theme.logoUrl}
          faviconUrl={theme.faviconUrl}
          key={theme.updatedAt.toISOString()}
          action={updateThemeAction.bind(null, storeId)}
          theme={theme}
        />
      </SettingsSection>
    </div>
  )
}
