import { notFound } from 'next/navigation'
import {
  getTemplateForBuilder,
  listTemplateCategories,
} from '@/server/services/templateService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import { ThemeForm } from '@/components/dashboard/theme-form'
import { TemplateLiquidUpload } from '@/components/admin/template-liquid-upload'
import { TemplateMetaForm } from './TemplateMetaForm'
import { DeleteTemplateButton } from './DeleteTemplateButton'
import { updateTemplateThemeAction } from './actions'

export default async function TemplateSettingsPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params

  let result
  try {
    result = await getTemplateForBuilder(templateId)
  } catch {
    notFound()
  }
  const { template, theme } = result

  const categories = await listTemplateCategories()

  return (
    <PageShell>
      <PageHeader
        backHref="/admin/templates"
        backLabel="Templates"
        eyebrow="Template"
        title={template.name}
        description="Gallery details, default styling, and removal."
      />

      <SettingsSection
        title="Details"
        description="How this template is listed in the tenant-facing gallery."
      >
        <TemplateMetaForm
          templateId={templateId}
          name={template.name}
          description={template.description}
          categoryId={template.categoryId}
          status={template.status}
          isPremium={template.isPremium}
          categories={categories}
        />
      </SettingsSection>

      <SettingsSection
        title="Default styling"
        description="The theme a store inherits when it starts from this template."
      >
        <ThemeForm
          key={template.updatedAt.toISOString()}
          action={updateTemplateThemeAction.bind(null, templateId)}
          theme={theme}
        />
      </SettingsSection>

      <SettingsSection
        title="Delete template"
        description="Removes the template and its sections. Stores already created from it are unaffected."
      >
        <DeleteTemplateButton templateId={templateId} />
      </SettingsSection>
      <SettingsSection
        title="Liquid design"
        description="Paste a full-page Liquid design to make this template available to merchants. Its schema block becomes the editing form in the builder."
      >
        <TemplateLiquidUpload
          templateId={template.id}
          source={template.liquidSource}
        />
      </SettingsSection>
    </PageShell>
  )
}
