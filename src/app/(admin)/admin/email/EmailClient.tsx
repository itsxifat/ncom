'use client'

import { useActionState, useState, useTransition } from 'react'
import { Mail, Send, Trash2 } from 'lucide-react'
import {
  deleteSmtpConfigAction,
  saveSmtpConfigAction,
  sendTestEmailAction,
  type SmtpFormState,
} from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { SettingsSection } from '@/components/app/settings-section'
import { FormSelect } from '@/components/store/form-controls'

export interface SmtpConfigRow {
  purpose: string
  label: string | null
  isEnabled: boolean
  host: string
  port: number
  encryption: string
  username: string
  passwordPreview: string | null
  fromName: string
  fromEmail: string
  replyToEmail: string | null
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastTestError: string | null
}

/**
 * The purposes a platform sends mail for.
 *
 * Ordered with DEFAULT first because it is the fallback every other purpose
 * inherits from — an operator setting up one server only needs that row.
 */
export const EMAIL_PURPOSES = [
  {
    value: 'DEFAULT',
    label: 'Default (fallback for everything)',
    hint: 'Used by any purpose below that has no server of its own.',
  },
  {
    value: 'EMAIL_VERIFICATION',
    label: 'Email verification codes',
    hint: 'Signup OTPs. Needs to arrive in seconds — use a transactional provider.',
  },
  {
    value: 'PASSWORD_RESET',
    label: 'Password reset codes',
    hint: 'Same urgency as verification.',
  },
  {
    value: 'TEAM_INVITATION',
    label: 'Team invitations',
    hint: 'Links inviting someone into a workspace.',
  },
  {
    value: 'BILLING',
    label: 'Billing and plan changes',
    hint: 'Plan activated, order recorded, subscription ending.',
  },
  {
    value: 'DOMAIN_ALERT',
    label: 'Domain alerts',
    hint: 'A custom domain verified or failing.',
  },
  {
    value: 'USAGE_ALERT',
    label: 'Usage warnings',
    hint: 'Approaching or exceeding a plan limit.',
  },
  {
    value: 'ORDER_RECEIPT',
    label: 'Storefront order receipts',
    hint: 'Sent on behalf of tenants to their shoppers — highest volume.',
  },
  {
    value: 'MARKETING',
    label: 'Marketing',
    hint: 'Keep separate: a complaint here must not affect verification delivery.',
  },
  {
    value: 'SYSTEM_ALERT',
    label: 'System alerts',
    hint: 'Platform notices to you.',
  },
] as const

function SmtpForm({
  purpose,
  config,
  onClose,
}: {
  purpose: string
  config: SmtpConfigRow | null
  onClose: () => void
}) {
  const [state, action, pending] = useActionState<SmtpFormState, FormData>(
    saveSmtpConfigAction,
    undefined
  )

  const meta = EMAIL_PURPOSES.find((entry) => entry.value === purpose)

  return (
    <Card>
      <CardContent>
        <form action={action}>
          <input type="hidden" name="purpose" value={purpose} />
          <FieldGroup>
            <div>
              <p className="text-sm font-medium">{meta?.label ?? purpose}</p>
              {meta?.hint && (
                <p className="text-muted-foreground text-xs">{meta.hint}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${purpose}-host`}>SMTP host</FieldLabel>
                <Input
                  id={`${purpose}-host`}
                  name="host"
                  defaultValue={config?.host ?? ''}
                  placeholder="smtp.example.com"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${purpose}-port`}>Port</FieldLabel>
                <Input
                  id={`${purpose}-port`}
                  name="port"
                  inputMode="numeric"
                  defaultValue={String(config?.port ?? 587)}
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor={`${purpose}-encryption`}>
                  Encryption
                </FieldLabel>
                <FormSelect
                  id={`${purpose}-encryption`}
                  name="encryption"
                  defaultValue={config?.encryption ?? 'STARTTLS'}
                >
                  <option value="STARTTLS">STARTTLS (587)</option>
                  <option value="SSL_TLS">SSL/TLS (465)</option>
                  <option value="NONE">None</option>
                </FormSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${purpose}-username`}>
                  Username
                </FieldLabel>
                <Input
                  id={`${purpose}-username`}
                  name="username"
                  defaultValue={config?.username ?? ''}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${purpose}-password`}>
                  Password
                </FieldLabel>
                <Input
                  id={`${purpose}-password`}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={config?.passwordPreview ?? 'App password'}
                />
                <FieldDescription>
                  {config?.passwordPreview
                    ? 'Leave blank to keep the stored password.'
                    : 'Stored encrypted; never shown again.'}
                </FieldDescription>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor={`${purpose}-fromName`}>
                  From name
                </FieldLabel>
                <Input
                  id={`${purpose}-fromName`}
                  name="fromName"
                  defaultValue={config?.fromName ?? 'NCOM'}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${purpose}-fromEmail`}>
                  From address
                </FieldLabel>
                <Input
                  id={`${purpose}-fromEmail`}
                  name="fromEmail"
                  type="email"
                  defaultValue={config?.fromEmail ?? ''}
                  placeholder="no-reply@example.com"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${purpose}-replyToEmail`}>
                  Reply-to
                </FieldLabel>
                <Input
                  id={`${purpose}-replyToEmail`}
                  name="replyToEmail"
                  type="email"
                  defaultValue={config?.replyToEmail ?? ''}
                  placeholder="Optional"
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="isEnabled"
                defaultChecked={config?.isEnabled ?? true}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block font-medium">Enabled</span>
                <span className="text-muted-foreground block text-xs">
                  Off stops this category of mail entirely — it does not fall
                  back to the default server.
                </span>
              </span>
            </label>

            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.notice && (
              <p className="text-sm text-emerald-600">{state.notice}</p>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save mail server'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function TestSender({ purpose }: { purpose: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; notice?: string }>({})
  const [recipient, setRecipient] = useState('')

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="you@example.com"
          type="email"
          className="h-8 w-52"
          aria-label={`Send a test ${purpose} email to`}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !recipient}
          onClick={() =>
            startTransition(async () => {
              setResult(await sendTestEmailAction(purpose as never, recipient))
            })
          }
        >
          <Send />
          {isPending ? 'Sending…' : 'Test'}
        </Button>
      </div>
      {result.error && (
        <p className="text-destructive max-w-80 text-xs">{result.error}</p>
      )}
      {result.notice && (
        <p className="text-xs text-emerald-600">{result.notice}</p>
      )}
    </div>
  )
}

export function EmailClient({ configs }: { configs: SmtpConfigRow[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const byPurpose = new Map(configs.map((config) => [config.purpose, config]))

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {EMAIL_PURPOSES.map((purpose) => {
        const config = byPurpose.get(purpose.value) ?? null
        const isEditing = editing === purpose.value

        return (
          <SettingsSection
            key={purpose.value}
            title={purpose.label}
            description={purpose.hint}
          >
            {isEditing ? (
              <SmtpForm
                purpose={purpose.value}
                config={config}
                onClose={() => setEditing(null)}
              />
            ) : (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    {config ? (
                      <>
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          <Mail className="text-muted-foreground size-4" />
                          <span className="font-mono">
                            {config.host}:{config.port}
                          </span>
                          <Badge
                            variant={config.isEnabled ? 'secondary' : 'outline'}
                          >
                            {config.isEnabled ? 'enabled' : 'off'}
                          </Badge>
                          {config.lastTestAt && (
                            <Badge
                              variant={
                                config.lastTestOk ? 'secondary' : 'destructive'
                              }
                            >
                              {config.lastTestOk
                                ? 'test passed'
                                : 'test failed'}
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground mt-1 truncate text-xs">
                          {config.fromName} &lt;{config.fromEmail}&gt; ·{' '}
                          {config.encryption} · {config.username || 'no auth'} ·{' '}
                          {config.passwordPreview ?? 'no password'}
                        </p>
                        {config.lastTestError && (
                          <p className="text-destructive mt-1 text-xs">
                            {config.lastTestError}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {purpose.value === 'DEFAULT'
                          ? 'Not configured — no mail can be sent at all until this is set.'
                          : 'Not configured — falls back to the default server.'}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {config && <TestSender purpose={purpose.value} />}
                    <Button
                      size="sm"
                      variant={config ? 'outline' : 'default'}
                      onClick={() => setEditing(purpose.value)}
                    >
                      {config ? 'Edit' : 'Configure'}
                    </Button>
                    {config && (
                      <Button
                        size="icon-sm"
                        variant="destructive"
                        title="Remove this server"
                        disabled={isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Remove the ${purpose.label} mail server?`
                            )
                          ) {
                            return
                          }
                          startTransition(async () => {
                            const result = await deleteSmtpConfigAction(
                              purpose.value as never
                            )
                            setError(result.error ?? null)
                          })
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </SettingsSection>
        )
      })}
    </div>
  )
}
