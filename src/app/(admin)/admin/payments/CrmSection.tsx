import Link from 'next/link'
import { crmStatus } from '@/server/billing/crmSync'
import { vatNote } from '@/server/billing/tax'
import { SettingsSection } from '@/components/app/settings-section'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'
import { CompareButton, ResendButton } from './CrmButtons'

const STATE_LABELS: Record<string, string> = {
  PENDING: 'On its way',
  SYNCED: 'In the CRM',
  REVIEW: 'Finance to check',
  REJECTED: 'Refused',
  MISMATCH: 'Differs',
  SKIPPED: 'Not for the CRM',
}

function when(value: Date | string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/**
 * Admin → Payments → Enfinito CRM: where NCOM's sales are invoiced and booked
 * as income. What is on its way, what finance has to check, the VAT the CRM
 * decides, and when both sides last agreed.
 */
export async function CrmSection() {
  const status = await crmStatus()

  if (!status.enabled) {
    return (
      <SettingsSection
        title="Enfinito CRM"
        description="Every NCOM invoice and payment goes to the CRM and counts as income under the NCOM product. VAT is decided there."
      >
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <Badge variant="outline">Not connected</Badge>
          </p>
          <p className="text-muted-foreground">
            In the CRM, open Configuration → Integrations → NCOM, make the
            secret and connect NCOM. Then set <code>CRM_BASE_URL</code> and{' '}
            <code>CRM_API_SECRET</code> on the NCOM server and restart it. Until
            then invoices carry no VAT and stay here.
          </p>
        </div>
      </SettingsSection>
    )
  }

  const counts = status.counts
  const policy = status.policy
  const report = status.reconcile
  const tax = policy
    ? vatNote(policy) ||
      (policy.vatTreatment === 'NONE'
        ? 'No VAT on NCOM invoices.'
        : `${policy.vatTreatment.toLowerCase().replace('_', '-')}: no VAT charged.`)
    : 'Not given yet: checkouts wait until the CRM answers.'

  return (
    <SettingsSection
      title="Enfinito CRM"
      description="Every NCOM invoice and payment goes to the CRM by itself and counts as income under the NCOM product. VAT, the service code and gateway charges are decided there; NCOM follows."
    >
      <div className="flex flex-col gap-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.connectionError ? 'outline' : 'secondary'}>
            {status.connectionError ? 'Not reachable' : 'Connected'}
          </Badge>
          <span className="text-muted-foreground">{status.target}</span>
          {status.syncFrom && (
            <span className="text-muted-foreground">
              · from {status.syncFrom.toISOString().slice(0, 10)}
            </span>
          )}
        </div>
        {status.connectionError && (
          <p className="text-muted-foreground">
            {status.connectionError}. Invoices wait and go as soon as it
            answers; owners can still pay.
          </p>
        )}

        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">VAT</dt>
            <dd>
              {tax}
              {policy?.serviceCode && ` Service code ${policy.serviceCode}.`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Invoices</dt>
            <dd>
              {(counts.SYNCED ?? 0).toLocaleString()} in the CRM
              {(counts.PENDING ?? 0) > 0 && ` · ${counts.PENDING} on their way`}
              {(counts.REVIEW ?? 0) +
                (counts.REJECTED ?? 0) +
                (counts.MISMATCH ?? 0) >
                0 &&
                ` · ${(counts.REVIEW ?? 0) + (counts.REJECTED ?? 0) + (counts.MISMATCH ?? 0)} to look at`}
            </dd>
          </div>
        </dl>

        {status.problems.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium">Needs a look</p>
            <ListPanel>
              {status.problems.map((p) => (
                <ListRow key={p.id}>
                  <ListRowText
                    title={
                      <Link
                        href={`/print/invoices/${p.id}`}
                        className="font-mono hover:underline"
                      >
                        {p.number}
                      </Link>
                    }
                    meta={
                      <>
                        {p.organization?.name ?? 'Workspace removed'}
                        {p.crmError && ` · ${p.crmError}`}
                        {p.crmState === 'PENDING' &&
                          ` · next try ${when(p.crmNextAttemptAt)}`}
                      </>
                    }
                    badges={
                      <Badge variant="outline">
                        {STATE_LABELS[p.crmState] ?? p.crmState}
                      </Badge>
                    }
                  />
                  <ListRowActions>
                    <Money>{formatMoney(p.totalCents, 'BDT')}</Money>
                    <ResendButton id={p.id} />
                  </ListRowActions>
                </ListRow>
              ))}
            </ListPanel>
            <p className="text-muted-foreground text-xs">
              “Finance to check” and “Refused” are fixed in the CRM (its NCOM
              status lists the reason); NCOM tries again by itself every 15
              minutes, so fixing the cause there is enough.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground">
            {report
              ? report.diffCount === 0
                ? `Last compared ${when(report.at)}: ${report.ncom.count} invoices, ${formatMoney(Math.round(report.ncom.paid * 100), 'BDT')} received, agree with the CRM.`
                : `Last compared ${when(report.at)}: ${report.diffCount} difference(s)${report.resent ? `, ${report.resent} sent again` : ''}.`
              : 'Not compared yet. It runs every six hours.'}
          </p>
          <CompareButton />
        </div>
        {report && report.diffs.length > 0 && (
          <ul className="text-muted-foreground -mt-2 list-disc pl-5 text-xs">
            {report.diffs.slice(0, 10).map((d) => (
              <li key={`${d.id}-${d.code}`}>
                {d.number}: {d.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSection>
  )
}
