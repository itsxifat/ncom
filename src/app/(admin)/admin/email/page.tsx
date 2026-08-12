import { listEmailLog, listSmtpConfigs } from '@/server/services/emailService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import { ListPanel, ListRow, ListRowText } from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { EmailClient, type SmtpConfigRow } from './EmailClient'

export const metadata = { title: 'Email' }

const STATUS_VARIANT: Record<string, 'secondary' | 'outline' | 'destructive'> =
  {
    SENT: 'secondary',
    SKIPPED: 'outline',
    FAILED: 'destructive',
  }

export default async function AdminEmailPage() {
  const [configs, log] = await Promise.all([
    listSmtpConfigs(),
    listEmailLog(50),
  ])

  const rows: SmtpConfigRow[] = configs.map((config) => ({
    purpose: config.purpose,
    label: config.label,
    isEnabled: config.isEnabled,
    host: config.host,
    port: config.port,
    encryption: config.encryption,
    username: config.username,
    passwordPreview: config.passwordPreview,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    replyToEmail: config.replyToEmail,
    lastTestAt: config.lastTestAt?.toISOString() ?? null,
    lastTestOk: config.lastTestOk,
    lastTestError: config.lastTestError,
  }))

  return (
    <PageShell>
      <PageHeader
        eyebrow="Configuration"
        title="Email"
        description="One SMTP server per purpose, so verification codes and marketing mail never share a sending reputation. Passwords are encrypted at rest and never shown again."
      />

      <EmailClient configs={rows} />

      <SettingsSection
        title="Recent activity"
        description="The last 50 send attempts. Message bodies and verification codes are deliberately never recorded."
      >
        {log.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing sent yet. Configure a server above and send a test.
          </p>
        ) : (
          <ListPanel>
            {log.map((entry) => (
              <ListRow key={entry.id}>
                <ListRowText
                  title={entry.subject}
                  meta={
                    <>
                      {entry.toEmail} ·{' '}
                      {entry.purpose.replace(/_/g, ' ').toLowerCase()}
                      {entry.smtpHost && ` · ${entry.smtpHost}`} ·{' '}
                      {entry.createdAt.toLocaleString()}
                      {entry.error && (
                        <span className="text-destructive">
                          {' '}
                          · {entry.error}
                        </span>
                      )}
                    </>
                  }
                  badges={
                    <Badge variant={STATUS_VARIANT[entry.status] ?? 'outline'}>
                      {entry.status.toLowerCase()}
                    </Badge>
                  }
                />
              </ListRow>
            ))}
          </ListPanel>
        )}
      </SettingsSection>
    </PageShell>
  )
}
