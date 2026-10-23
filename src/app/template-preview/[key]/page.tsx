import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { getTemplate } from '@/modules/templates'
import { isSiteLanguage } from '@/modules/sections/language'
import { loadSiteDraft } from '@/server/services/designDraftService'
import { templatePreview, type PreviewPage } from '@/modules/templates/preview'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import { PageThemeProvider } from '@/modules/sections/theme'
import { sampleCommerce } from '@/modules/storefront/sample'
import { PreviewGuard } from '@/modules/storefront/PreviewGuard'

export const metadata: Metadata = {
  title: 'Template preview',
  robots: { index: false, follow: false },
}

const PAGES: PreviewPage[] = ['home', 'product', 'catalog']

/**
 * A template, drawn full size with sample products, for the create-a-site
 * gallery. Loaded in an iframe — scaled down as a thumbnail, or full size in
 * the preview — so the template's own breakpoints resolve against the frame's
 * width rather than the dashboard's.
 *
 * `?lang=bn` draws it in Bangla. A key of `draft-<id>` draws a design made for
 * one site — by the AI builder, or pasted in — that has not been created yet;
 * only the workspace that made it can see it.
 */
export default async function TemplatePreviewPage({
  params,
  searchParams,
}: PageProps<'/template-preview/[key]'>) {
  const [{ key }, query] = await Promise.all([params, searchParams])
  const { organization } = await getActiveOrganization()

  const draft = key.startsWith('draft-')
    ? await loadSiteDraft(organization.id, key.slice('draft-'.length))
    : null
  const template = draft?.template ?? getTemplate(key)
  if (!template) notFound()
  const language = draft
    ? draft.language
    : isSiteLanguage(query.lang)
      ? query.lang
      : 'en'

  const which = PAGES.find((page) => page === query.page) ?? 'home'

  // Priced in the workspace's own currency, so a merchant in Dhaka sees ৳
  // on the sample products rather than dollars.
  const settings = await getOrganizationSettings(organization.id)
  const currencyCode = settings?.currencyCode ?? 'BDT'

  const preview = templatePreview(template, which, currencyCode, language)

  if (template.kind !== 'STORE') {
    return (
      <>
        <PreviewGuard />
        <PageRenderer
          theme={preview.theme}
          sections={preview.sections}
          commerce={sampleCommerce(currencyCode)}
        />
      </>
    )
  }

  return (
    <>
      <PreviewGuard />
      <PageThemeProvider
        theme={preview.theme}
        className="flex min-h-svh flex-col"
      >
        <PageRenderer
          bare
          theme={preview.theme}
          sections={preview.top}
          storefront={preview.storefront}
        />
        <main className="flex flex-1 flex-col">
          <PageRenderer
            bare
            theme={preview.theme}
            sections={preview.sections}
            storefront={preview.storefront}
          />
        </main>
        <PageRenderer
          bare
          theme={preview.theme}
          sections={preview.bottom}
          storefront={preview.storefront}
        />
      </PageThemeProvider>
    </>
  )
}
