import { env } from '@/lib/env'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { SITE_TEMPLATES } from '@/modules/templates'
import { aiBuilderAvailable } from '@/server/services/aiSettingsService'
import { NewSiteWizard, type TemplateSummary } from './NewSiteWizard'

/**
 * Making a website: what kind, which design, what it is called.
 *
 * The currency is asked only for the workspace's first site. It belongs to
 * the workspace, not the site — every order is recorded in it — so asking
 * again on the second site would offer a choice that changes nothing.
 */
export default async function NewSitePage({
  searchParams,
}: PageProps<'/stores/new'>) {
  const query = await searchParams
  const { organization } = await getActiveOrganization()
  const settings = await getOrganizationSettings(organization.id)

  const templates: TemplateSummary[] = SITE_TEMPLATES.map((template) => ({
    key: template.key,
    kind: template.kind,
    name: template.name,
    description: template.description,
    bestFor: template.bestFor,
    colors: [
      template.theme.backgroundColor,
      template.theme.primaryColor,
      template.theme.textColor,
      template.theme.secondaryColor,
    ],
    blank: template.key.endsWith('-blank'),
  }))

  const kind =
    query.kind === 'STORE' || query.kind === 'LANDING' ? query.kind : null
  // Sent from the end of onboarding: a design suggested for what the business
  // sells, and its name — the wizard opens on the last step with both filled.
  const template =
    typeof query.template === 'string'
      ? templates.find(
          (entry) => entry.key === query.template && entry.kind === kind
        )
      : undefined
  const name =
    typeof query.name === 'string' ? query.name.trim().slice(0, 80) : ''

  return (
    <NewSiteWizard
      rootDomain={env.ROOT_DOMAIN}
      templates={templates}
      askCurrency={!settings}
      initialKind={kind}
      initialTemplate={template?.key ?? null}
      initialName={template ? name : ''}
      aiAvailable={await aiBuilderAvailable()}
    />
  )
}
