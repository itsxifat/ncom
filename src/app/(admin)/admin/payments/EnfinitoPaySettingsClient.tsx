'use client'

import { useActionState, useId, useState, useTransition } from 'react'
import {
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  PlugZap,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  removeEnfinitoPayAction,
  saveEnfinitoPayAction,
  testEnfinitoPayAction,
  type EnfinitoPayFormState,
} from './actions'
import { SettingsSection } from '@/components/app/settings-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'

interface SecretStatus {
  source: 'admin' | 'environment' | null
  preview: string | null
}

export interface EnfinitoPaySettingsStatus {
  secretKey: SecretStatus
  webhookSecret: SecretStatus
  mode: 'test' | 'live' | null
  savedAt: string | null
}

/**
 * Connecting NCOM's Enfinito Pay product. The secrets are never sent back to
 * the browser — the status shows their last four characters — and the form
 * saves a secret key only once Enfinito Pay accepts it.
 */
export function EnfinitoPaySettingsClient({
  status,
  webhookUrl,
  returnDomain,
}: {
  status: EnfinitoPaySettingsStatus
  webhookUrl: string
  returnDomain: string
}) {
  return (
    <div className="flex flex-col gap-8">
      <KeysCard status={status} />
      <SettingsSection
        title="In the Enfinito Pay admin"
        description="Two settings on NCOM's product there, so payments can come back to NCOM."
      >
        <div className="flex flex-col gap-5">
          <CopyField
            label="Webhook URL"
            value={webhookUrl}
            hint="Enfinito Pay tells NCOM here when a payment succeeds or is refunded. Each event is signed with the webhook secret above."
          />
          <CopyField
            label="Return domain"
            value={returnDomain}
            hint="Where owners come back to after paying. Add it to the product's return domains, or Enfinito Pay refuses the checkout."
          />
        </div>
      </SettingsSection>
    </div>
  )
}

function KeysCard({ status }: { status: EnfinitoPaySettingsStatus }) {
  const [state, action, pending] = useActionState<
    EnfinitoPayFormState,
    FormData
  >(saveEnfinitoPayAction, undefined)
  const [testing, startTest] = useTransition()
  const [removing, startRemove] = useTransition()
  const connected = Boolean(status.secretKey.source)
  const fromAdmin =
    status.secretKey.source === 'admin' ||
    status.webhookSecret.source === 'admin'

  return (
    <SettingsSection
      title="Enfinito Pay"
      description="The secret key and webhook secret of NCOM's product in the Enfinito Pay admin. A sk_test_ key takes test payments only; swap in a sk_live_ key to take real ones. Both are encrypted before they are stored."
    >
      <div className="flex flex-col gap-5">
        <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-xl p-4">
          {connected ? (
            <>
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  Connected
                  <span className="text-muted-foreground font-mono text-xs">
                    {status.secretKey.preview}
                  </span>
                  <Badge
                    variant={status.mode === 'live' ? 'secondary' : 'outline'}
                  >
                    {status.mode === 'live' ? 'Live' : 'Test mode'}
                  </Badge>
                </p>
                <p className="text-muted-foreground text-xs">
                  {status.secretKey.source === 'admin'
                    ? `Saved here${status.savedAt ? ` on ${new Date(status.savedAt).toLocaleDateString()}` : ''}.`
                    : 'From ENFINITO_PAY_SECRET_KEY in the server environment. A key saved here takes its place.'}{' '}
                  {status.webhookSecret.source
                    ? `Webhook secret ${status.webhookSecret.preview}${status.webhookSecret.source === 'environment' ? ' (from the environment)' : ''}.`
                    : 'No webhook secret yet.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={() =>
                  startTest(async () => {
                    const result = await testEnfinitoPayAction()
                    if (result.ok) toast.success(result.message)
                    else toast.error(result.message)
                  })
                }
              >
                {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
                Test connection
              </Button>
              {fromAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Remove the saved keys? Paid plans and credits can’t be bought online until new ones are saved.'
                      )
                    ) {
                      return
                    }
                    startRemove(async () => {
                      await removeEnfinitoPayAction()
                      toast.success('Keys removed')
                    })
                  }}
                >
                  <Trash2 />
                  Remove
                </Button>
              )}
            </>
          ) : (
            <>
              <KeyRound className="text-muted-foreground size-5 shrink-0" />
              <p className="text-sm">
                Not connected. Until a secret key is saved, a paid plan or
                credit pack is recorded and waits for your team to mark it paid.
              </p>
            </>
          )}
        </div>

        <form action={action} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="secretKey">
              {connected ? 'Replace the secret key' : 'Secret key'}
            </FieldLabel>
            <Input
              id="secretKey"
              name="secretKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk_live_… or sk_test_…"
              className="font-mono"
            />
            <FieldDescription>
              Shown once when it is created in the Enfinito Pay admin. Tested
              with Enfinito Pay before it is saved.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="webhookSecret">
              {status.webhookSecret.source
                ? 'Replace the webhook secret'
                : 'Webhook secret'}
            </FieldLabel>
            <Input
              id="webhookSecret"
              name="webhookSecret"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="whsec_…"
              className="font-mono"
            />
            <FieldDescription>
              Leave either empty to keep the one already saved.
            </FieldDescription>
          </Field>
          {state?.error && <FieldError>{state.error}</FieldError>}
          {state?.notice && (
            <p className="text-sm text-emerald-600">{state.notice}</p>
          )}
          <Button type="submit" disabled={pending} className="self-start">
            {pending && <Loader2 className="animate-spin" />}
            {pending ? 'Checking…' : 'Save'}
          </Button>
        </form>
      </div>
    </SettingsSection>
  )
}

function CopyField({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  const [copied, setCopied] = useState(false)
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono" />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(value)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  )
}
