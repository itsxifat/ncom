import { getActiveOrganization } from '@/server/services/organizationService'
import { listThemeCode } from '@/server/services/liquidService'
import { PageHeader } from '@/components/app/page-header'
import { TemplateEditor } from '@/components/store/code-editor'

/**
 * Storefront templates.
 *
 * These are the only Liquid that cannot be built from layers, because the
 * pages they render have no layers to build: a product page is generated from
 * product data, not composed in the builder, so there is no section stack to
 * edit. Everything that *can* be a layer now is — pasted designs become
 * builder sections, which is why the old standalone Code tab is gone.
 */
export default async function StorefrontTemplatesPage({
  params,
}: PageProps<'/stores/[storeId]/theme/templates'>) {
  const { storeId } = await params
  const { organization } = await getActiveOrganization()
  const { templates } = await listThemeCode(organization.id, storeId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/stores/${storeId}/theme`}
        backLabel="Design"
        title="Storefront templates"
        description="The product, collection and cart pages. These are generated from your data, so they are edited as Liquid rather than as builder layers."
      />

      {templates.map((template) => (
        <TemplateEditor
          key={template.id}
          storeId={storeId}
          template={{
            id: template.id,
            type: template.type,
            source: template.source,
            publishedSource: template.publishedSource,
          }}
        />
      ))}
    </div>
  )
}
