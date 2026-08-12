import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getStore, getStoreIntegration } from '@/server/services/storeService'
import { domainTargets, listDomains } from '@/server/services/domainService'
import { getEntitlements } from '@/server/services/entitlementService'
import { countCustomDomains } from '@/server/services/usageService'
import { env } from '@/lib/env'
import { formatQuota, remainingQuota } from '@/lib/plans'
import { SettingsSection } from '@/components/app/settings-section'
import { StoreDetailsForm } from '@/components/dashboard/store-details-form'
import { DomainManager } from '@/components/dashboard/domain-manager'
import { IntegrationForm } from '@/components/dashboard/integration-form'
import { PageShell } from '@/components/app/page-shell'

/**
 * A store owns its address and its tracking, and nothing else.
 *
 * Currency, tax basis, order numbering and customer accounts used to be edited
 * here through `StoreSettingsForm`, but they are `OrganizationSettings` fields:
 * saving from one store silently rewrote them for every store in the
 * workspace, and the "locked once there are orders" guard was counting only
 * this store's orders while guarding a workspace-wide value. They belong to
 * the workspace and are edited under /settings/*.
 */
export default async function StoreSettingsPage({
  params,
}: PageProps<'/stores/[storeId]/settings'>) {
  const { storeId } = await params
  const { organization } = await getActiveOrganization()

  let store
  try {
    store = await getStore(organization.id, storeId)
  } catch {
    notFound()
  }

  const integration = await getStoreIntegration(organization.id, storeId)

  // Domains are quota'd per workspace, not per store, so the remaining count has
  // to come from the whole organisation — a tenant with one domain left should
  // see the same number on every store's settings page.
  const [domains, entitlements, domainsUsed] = await Promise.all([
    listDomains(organization.id, storeId),
    getEntitlements(organization.id),
    countCustomDomains(organization.id),
  ])
  const targets = domainTargets()
  const domainsRemaining = remainingQuota(
    entitlements.quotas.CUSTOM_DOMAINS,
    domainsUsed
  )

  return (
    <PageShell>
      <SettingsSection
        title="General"
        description="What the store is called and where it publishes to."
      >
        <StoreDetailsForm
          key={`${store.name}-${store.subdomain}`}
          storeId={store.id}
          name={store.name}
          subdomain={store.subdomain}
          rootDomain={env.ROOT_DOMAIN}
        />
      </SettingsSection>

      <SettingsSection
        title="Custom domains"
        description="Serve this store on a domain you own. The NCOM subdomain above keeps working either way."
      >
        <DomainManager
          storeId={store.id}
          domains={domains.map((domain) => ({
            id: domain.id,
            hostname: domain.hostname,
            status: domain.status,
            recordType: domain.recordType,
            isPrimary: domain.isPrimary,
            verificationToken: domain.verificationToken,
            challengeHost: domain.challengeHost,
            lastError: domain.lastError,
            lastCheckedAt: domain.lastCheckedAt?.toISOString() ?? null,
          }))}
          cnameTarget={targets.cnameTarget}
          aRecordIp={targets.aRecordIp}
          canAdd={domainsRemaining !== 0}
          limitLabel={formatQuota(entitlements.quotas.CUSTOM_DOMAINS, 'count')}
        />
      </SettingsSection>

      <SettingsSection
        title="Integrations"
        description="Analytics and tracking scripts injected into every published page in this store."
      >
        <IntegrationForm
          key={integration?.updatedAt.toISOString()}
          storeId={store.id}
          gaMeasurementId={integration?.gaMeasurementId ?? null}
          gtmContainerId={integration?.gtmContainerId ?? null}
          metaPixelId={integration?.metaPixelId ?? null}
          customHeadScript={integration?.customHeadScript ?? null}
        />
      </SettingsSection>

      <SettingsSection
        title="Workspace settings"
        description="Currency, tax, shipping, payments and order numbering are shared by every store in this workspace."
      >
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/settings/payments', label: 'Payments' },
            { href: '/settings/shipping', label: 'Shipping' },
            { href: '/settings/taxes', label: 'Taxes' },
            { href: '/settings/locations', label: 'Locations' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-card ring-foreground/6 hover:ring-foreground/12 rounded-full px-4 py-2 text-sm font-medium ring-1 transition"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </SettingsSection>
    </PageShell>
  )
}
