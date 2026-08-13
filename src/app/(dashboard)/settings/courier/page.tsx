import { getActiveOrganization } from '@/server/services/organizationService'
import { listCourierConfigs } from '@/server/services/courierConfigService'
import { getCourierSettings } from '@/server/services/fraudCheckService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { basisPointsToPercent } from '@/lib/validation/courier'
import { minorUnitsPerMajor } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import { Card, CardContent } from '@/components/ui/card'
import { listFraudAccounts } from '@/server/services/fraudAccountService'
import { CourierSettings } from '@/components/store/courier-settings'
import { FraudAccounts } from '@/components/store/fraud-accounts'
import { CourierAutomationForm } from '@/components/store/courier-automation-form'
import { FraudLookup } from '@/components/store/fraud-lookup'

/**
 * Courier automation setup.
 *
 * Ordered the way the feature is adopted, not the way the data is shaped:
 * connect an account, decide the rules, then check a number by hand to see what
 * the rules would do. A merchant who lands here for the first time can follow it
 * top to bottom.
 */

export default async function CourierSettingsPage() {
  const { organization } = await getActiveOrganization()

  const [configs, automation, orgSettings, fraudAccounts] = await Promise.all([
    listCourierConfigs(organization.id),
    getCourierSettings(organization.id),
    getOrganizationSettings(organization.id),
    listFraudAccounts(organization.id),
  ])

  // The callback URL is built server-side from the configured public origin —
  // the merchant is going to paste it into a courier's panel, and a relative
  // path or a browser-derived host would send status updates to the wrong place
  // (or nowhere) the moment they open the dashboard on a preview domain.
  const origin = (process.env.AUTH_URL ?? '').replace(/\/$/, '')

  const currencyCode = orgSettings?.currencyCode ?? 'BDT'
  const perMajor = minorUnitsPerMajor(currencyCode)

  // Screening runs off the portal accounts below, not off the courier API keys.
  // A store can perfectly well ship without screening or screen without
  // shipping, so the two are reported independently.
  const screeningReady = fraudAccounts.some((account) => account.isActive)

  return (
    <PageShell>
      <PageHeader
        title="Courier & fraud"
        description="Connect Steadfast and Pathao, screen customers against their delivery history, and let clean orders ship without you."
      />

      <SettingsSection
        title="Courier accounts"
        description="Your own courier contracts. Credentials are encrypted before they are stored and are never sent back to the browser."
        bare
      >
        <CourierSettings
          configs={configs.map((config) => ({
            provider: config.provider,
            displayName: config.displayName,
            isEnabled: config.isEnabled,
            testMode: config.testMode,
            isDefault: config.isDefault,
            credentialPreview: config.credentialPreview,
            settings: config.settings,
            webhookUrl: `${origin}/api/courier/${config.provider.toLowerCase()}/${config.webhookToken}`,
            hasWebhookSecret: config.hasWebhookSecret,
            lastVerifiedAt: config.lastVerifiedAt?.toISOString() ?? null,
            lastErrorMessage: config.lastErrorMessage,
          }))}
        />
      </SettingsSection>

      <SettingsSection
        title="Fraud screening accounts"
        description="Steadfast merchant portal logins used to read a customer's delivery history. A different credential from the API keys above — these read, those ship."
        bare
      >
        <FraudAccounts
          accounts={fraudAccounts.map((account) => ({
            id: account.id,
            email: account.email,
            label: account.label,
            isActive: account.isActive,
            isPrimary: account.isPrimary,
            lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
            lastTestOk: account.lastTestOk,
            lastTestMessage: account.lastTestMessage,
            lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </SettingsSection>

      <SettingsSection
        title="Automation rules"
        description="What has to be true about a customer before an order ships without anyone looking at it."
      >
        <CourierAutomationForm
          screeningReady={screeningReady}
          values={{
            autoDispatchEnabled: automation.autoDispatchEnabled,
            fraudCheckEnabled: automation.fraudCheckEnabled,
            minDeliveryRatePercent: basisPointsToPercent(
              automation.minDeliveryRateBps
            ),
            minTotalParcels: automation.minTotalParcels,
            minDeliveredOrders: automation.minDeliveredOrders,
            maxFraudReports: automation.maxFraudReports,
            maxCancelledOrders: automation.maxCancelledOrders,
            allowUnknownCustomers: automation.allowUnknownCustomers,
            manualReviewAbove:
              automation.manualReviewAboveCents == null
                ? null
                : automation.manualReviewAboveCents / perMajor,
            dispatchDelayMinutes: automation.dispatchDelayMinutes,
            requirePaidOrders: automation.requirePaidOrders,
            fraudCacheHours: automation.fraudCacheHours,
            autoCancelOnFail: automation.autoCancelOnFail,
            currencyCode,
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="Check a number"
        description="Vet a customer before you take an order over the phone or on social media."
      >
        <FraudLookup />
      </SettingsSection>

      <SettingsSection
        title="Keeping statuses live"
        description="How parcel updates reach this dashboard once an order is on its way."
      >
        <Card>
          <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
            <p className="text-pretty">
              Couriers push every status change to the callback URL shown
              against each account above. That is the fast path — a parcel
              marked delivered appears here within seconds, and cash collected
              on delivery is recorded against the order automatically.
            </p>
            <p className="text-pretty">
              A scheduled sweep sits behind it and asks the couriers directly
              about any parcel that has gone quiet for 90 minutes. A dropped
              webhook is silent by nature, so without this the only way to
              notice one is a customer asking where their order is. Point a cron
              job at <code>/api/cron/courier-sync</code> every five minutes to
              enable it.
            </p>
          </CardContent>
        </Card>
      </SettingsSection>
    </PageShell>
  )
}
