'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import {
  rotateCourierWebhookAction,
  saveCourierAction,
  setCourierWebhookSecretAction,
  testCourierAction,
  type CourierActionState,
} from '@/app/(dashboard)/courier-actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import type { CourierProvider } from '@/generated/prisma/enums'

/**
 * Credential fields per courier.
 *
 * `secret: true` marks a value the server will never send back — the browser
 * gets a masked preview and an empty input, and submitting it empty means "keep
 * what is stored". That is why none of these have a `defaultValue`.
 */
const COURIERS = [
  {
    id: 'STEADFAST' as const,
    label: 'Steadfast Courier',
    blurb:
      'Nationwide cash-on-delivery across Bangladesh. Also the source of the customer delivery history used for fraud screening.',
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        secret: false,
        hint: 'From Steadfast: Merchant panel → API.',
      },
      { key: 'secretKey', label: 'Secret key', secret: true },
    ],
    // Screening is a second, separate credential on the same account: the API
    // key creates parcels, the portal login reads delivery history. Merchants
    // consistently assume one implies the other, so they are grouped and
    // labelled apart.
    fraudFields: [
      {
        key: 'fraudEmail',
        label: 'Merchant portal email',
        secret: false,
        hint: 'The login you use at portal.packzy.com — not the API key.',
      },
      { key: 'fraudPassword', label: 'Merchant portal password', secret: true },
    ],
    supportsTestMode: false,
  },
  {
    id: 'PATHAO' as const,
    label: 'Pathao Courier',
    blurb:
      'Same-day and next-day delivery in major cities, with on-demand pickup.',
    fields: [
      { key: 'clientId', label: 'Client ID', secret: false },
      { key: 'clientSecret', label: 'Client secret', secret: true },
      { key: 'username', label: 'Merchant email', secret: false },
      { key: 'password', label: 'Merchant password', secret: true },
    ],
    fraudFields: [],
    supportsTestMode: true,
  },
]

export interface CourierConfigRow {
  provider: CourierProvider
  displayName: string
  isEnabled: boolean
  testMode: boolean
  isDefault: boolean
  credentialPreview: Record<string, string>
  settings: Record<string, unknown>
  webhookUrl: string
  hasWebhookSecret: boolean
  lastVerifiedAt: string | null
  lastErrorMessage: string | null
}

export function CourierSettings({ configs }: { configs: CourierConfigRow[] }) {
  const byProvider = new Map(configs.map((config) => [config.provider, config]))

  return (
    <div className="flex flex-col gap-6">
      {COURIERS.map((courier) => (
        <CourierCard
          key={courier.id}
          courier={courier}
          existing={byProvider.get(courier.id)}
        />
      ))}
    </div>
  )
}

function CourierCard({
  courier,
  existing,
}: {
  courier: (typeof COURIERS)[number]
  existing?: CourierConfigRow
}) {
  const [state, action, pending] = useActionState<CourierActionState, FormData>(
    saveCourierAction,
    undefined
  )
  const [open, setOpen] = useState(!existing)
  const [isEnabled, setIsEnabled] = useSavedToggle(existing?.isEnabled ?? false)
  const [isDefault, setIsDefault] = useSavedToggle(existing?.isDefault ?? false)
  const [testMode, setTestMode] = useSavedToggle(existing?.testMode ?? false)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
              <Truck className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {courier.label}
                {existing?.isEnabled && <Badge variant="lime">Enabled</Badge>}
                {existing?.isDefault && (
                  <Badge variant="secondary">Default</Badge>
                )}
                {existing?.testMode && <Badge variant="outline">Sandbox</Badge>}
              </p>
              <p className="text-muted-foreground mt-1 text-sm text-pretty">
                {courier.blurb}
              </p>
              <VerificationLine existing={existing} />
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {existing && <TestButton provider={courier.id} />}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen((current) => !current)}
            >
              {open ? 'Close' : existing ? 'Edit' : 'Set up'}
            </Button>
          </div>
        </div>

        {existing && <WebhookPanel config={existing} />}

        {open && (
          <form action={action} className="border-border/60 border-t pt-4">
            <input type="hidden" name="provider" value={courier.id} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${courier.id}-name`}>Name</FieldLabel>
                <Input
                  id={`${courier.id}-name`}
                  name="displayName"
                  defaultValue={existing?.displayName ?? courier.label}
                />
              </Field>

              {courier.fields.map((field) => (
                <CredentialField
                  key={field.key}
                  provider={courier.id}
                  field={field}
                  existing={existing}
                />
              ))}

              {courier.fraudFields.length > 0 && (
                <div className="border-border/60 flex flex-col gap-4 rounded-lg border border-dashed p-4">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        Fraud screening login
                      </p>
                      <p className="text-muted-foreground text-sm text-pretty">
                        A different credential from the API key above. Without
                        it, parcels still ship but customers are not screened.
                      </p>
                    </div>
                  </div>

                  {courier.fraudFields.map((field) => (
                    <CredentialField
                      key={field.key}
                      provider={courier.id}
                      field={field}
                      existing={existing}
                    />
                  ))}
                </div>
              )}

              {courier.id === 'PATHAO' && (
                <>
                  <Field>
                    <FieldLabel htmlFor="pathao-store">
                      Pickup store ID
                    </FieldLabel>
                    <Input
                      id="pathao-store"
                      name="setting.storeId"
                      inputMode="numeric"
                      defaultValue={String(existing?.settings.storeId ?? '')}
                      placeholder="e.g. 130820"
                    />
                    <FieldDescription>
                      Run the connection test to list the store IDs on this
                      account. Parcels are collected from this address.
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="pathao-weight">
                      Default parcel weight (kg)
                    </FieldLabel>
                    <Input
                      id="pathao-weight"
                      name="setting.defaultWeightKg"
                      inputMode="decimal"
                      defaultValue={String(
                        existing?.settings.defaultWeightKg ?? '0.5'
                      )}
                    />
                    <FieldDescription>
                      Used when an order&rsquo;s products have no weight set.
                      Pathao accepts 0.5–10 kg.
                    </FieldDescription>
                  </Field>
                </>
              )}

              <label className="flex items-center gap-2 text-sm">
                <Switch
                  name="isEnabled"
                  checked={isEnabled}
                  onCheckedChange={setIsEnabled}
                />
                Use this courier
              </label>

              <label className="flex items-center gap-2 text-sm">
                <Switch
                  name="isDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
                Send orders here by default
              </label>

              {courier.supportsTestMode && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    name="testMode"
                    checked={testMode}
                    onCheckedChange={setTestMode}
                  />
                  Sandbox mode (no real parcels)
                </label>
              )}

              {state?.error && (
                <p className="text-destructive text-sm">{state.error}</p>
              )}
              {state?.success && (
                <p className="text-sm text-emerald-600">{state.success}</p>
              )}

              <div>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  Save {courier.label}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * A toggle the merchant edits locally that still follows the saved value.
 *
 * Saving revalidates this page, so the card re-renders in place with whatever
 * was just written — the switch never unmounts. An uncontrolled switch pins its
 * `defaultChecked` at mount and ignores every later value, which leaves the
 * toggle showing the state from before the save. Tracking the saved value
 * alongside the local one adopts it on the render it arrives, while an edit
 * made against a failed save (server value unchanged) survives untouched.
 */
function useSavedToggle(saved: boolean) {
  const [checked, setChecked] = useState(saved)
  const [lastSaved, setLastSaved] = useState(saved)

  if (saved !== lastSaved) {
    setLastSaved(saved)
    setChecked(saved)
  }

  return [checked, setChecked] as const
}

function CredentialField({
  provider,
  field,
  existing,
}: {
  provider: CourierProvider
  field: { key: string; label: string; secret: boolean; hint?: string }
  existing?: CourierConfigRow
}) {
  const stored = existing?.credentialPreview[field.key]

  return (
    <Field>
      <FieldLabel htmlFor={`${provider}-${field.key}`}>
        {field.label}
      </FieldLabel>
      <Input
        id={`${provider}-${field.key}`}
        name={`credential.${field.key}`}
        type={field.secret ? 'password' : 'text'}
        autoComplete="off"
        placeholder={
          stored ?? (field.secret ? 'Never shown again once saved' : '')
        }
      />
      {(stored || field.hint) && (
        <FieldDescription>
          {stored ? `Currently ${stored}. Leave empty to keep it.` : field.hint}
        </FieldDescription>
      )}
    </Field>
  )
}

function VerificationLine({ existing }: { existing?: CourierConfigRow }) {
  if (!existing) return null

  if (existing.lastErrorMessage) {
    return (
      <p className="text-destructive mt-2 flex items-start gap-1.5 text-sm">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{existing.lastErrorMessage}</span>
      </p>
    )
  }

  if (existing.lastVerifiedAt) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-600">
        <Check className="size-3.5 shrink-0" />
        Last verified {new Date(existing.lastVerifiedAt).toLocaleString()}
      </p>
    )
  }

  return (
    <p className="text-muted-foreground mt-2 text-sm">
      Not tested yet — run the connection test before switching it on.
    </p>
  )
}

/**
 * Runs the live credential test and shows what the courier answered.
 *
 * Pathao's store list comes back with it, because the pickup store ID is the
 * one setting a merchant cannot guess and cannot find without leaving this page.
 */
function TestButton({ provider }: { provider: CourierProvider }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof testCourierAction>
  > | null>(null)

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => setResult(await testCourierAction(provider)))
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Test connection
      </Button>

      {result && (
        <div className="max-w-sm text-right text-sm">
          <p className={result.ok ? 'text-emerald-600' : 'text-destructive'}>
            {result.detail}
          </p>

          {result.stores && result.stores.length > 0 && (
            <div className="text-muted-foreground mt-1.5">
              <p className="font-medium">Store IDs on this account:</p>
              <ul>
                {result.stores.map((store) => (
                  <li key={store.storeId}>
                    <code>{store.storeId}</code> — {store.storeName}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The inbound callback URL and its shared secret.
 *
 * This is the half of the integration that lives in the courier's panel rather
 * than ours, so it is displayed to be copied, with the retry consequence spelled
 * out — a merchant who skips this gets parcels that dispatch fine and then never
 * update again, which is the single most confusing failure mode in the whole
 * feature.
 */
function WebhookPanel({ config }: { config: CourierConfigRow }) {
  const [url, setUrl] = useState(config.webhookUrl)
  const [secret, setSecret] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Status callback URL</p>
        <p className="text-muted-foreground text-sm text-pretty">
          Paste this into{' '}
          {config.provider === 'STEADFAST'
            ? 'the Steadfast merchant panel under Webhook settings'
            : 'Pathao’s merchant panel under Webhook, and select all events'}
          . Without it, parcels dispatch but their status stops updating.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-background min-w-0 flex-1 overflow-x-auto rounded border px-2.5 py-1.5 text-xs">
          {url}
        </code>
        <CopyButton value={url} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await rotateCourierWebhookAction(config.provider)
              if (result.ok) {
                setUrl(url.replace(/[^/]+$/, result.token))
              }
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          New URL
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground flex-1 text-sm">
          {config.hasWebhookSecret
            ? 'A shared secret is set. The courier must send it back on every call.'
            : 'No shared secret yet. Generate one and paste it into the courier panel.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await setCourierWebhookSecretAction(
                config.provider,
                null
              )
              if (result.ok) setSecret(result.secret)
            })
          }
        >
          {config.hasWebhookSecret ? 'Regenerate secret' : 'Generate secret'}
        </Button>
      </div>

      {secret && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-background min-w-0 flex-1 overflow-x-auto rounded border px-2.5 py-1.5 text-xs">
            {secret}
          </code>
          <CopyButton value={secret} />
          <span className="text-muted-foreground text-xs">
            Shown once — copy it into the courier panel now.
          </span>
        </div>
      )}
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}
