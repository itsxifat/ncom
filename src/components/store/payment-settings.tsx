'use client'

import { useActionState, useState } from 'react'
import { CreditCard } from 'lucide-react'
import {
  savePaymentProviderAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

/**
 * Credential fields per provider.
 *
 * `secret: true` marks a value that must never be echoed back to the browser —
 * the server sends only a masked preview, and an empty submission means "keep
 * what is stored". That is why these inputs have no `defaultValue`.
 */
const PROVIDERS = [
  {
    id: 'STRIPE',
    label: 'Stripe',
    blurb:
      'Cards, wallets and local methods. Charges are captured immediately.',
    fields: [
      { key: 'publishableKey', label: 'Publishable key', secret: false },
      { key: 'secretKey', label: 'Secret key', secret: true },
      { key: 'webhookSecret', label: 'Webhook signing secret', secret: true },
    ],
  },
  {
    id: 'CASH_ON_DELIVERY',
    label: 'Cash on delivery',
    blurb:
      'The order is placed unpaid and you record payment when the courier settles.',
    fields: [],
  },
  {
    id: 'MANUAL',
    label: 'Bank transfer',
    blurb:
      'Show your bank details at checkout. The order stays pending until you mark it paid.',
    fields: [],
  },
  {
    id: 'BKASH',
    label: 'bKash',
    blurb: 'Mobile financial services for Bangladesh.',
    fields: [
      { key: 'appKey', label: 'App key', secret: false },
      { key: 'appSecret', label: 'App secret', secret: true },
      { key: 'username', label: 'Username', secret: false },
      { key: 'password', label: 'Password', secret: true },
    ],
  },
  {
    id: 'SSLCOMMERZ',
    label: 'SSLCOMMERZ',
    blurb: 'Aggregated cards and mobile banking for Bangladesh.',
    fields: [
      { key: 'storeId', label: 'Store ID', secret: false },
      { key: 'storePassword', label: 'Store password', secret: true },
    ],
  },
  {
    id: 'RAZORPAY',
    label: 'Razorpay',
    blurb: 'Cards, UPI and netbanking for India.',
    fields: [
      { key: 'keyId', label: 'Key ID', secret: false },
      { key: 'keySecret', label: 'Key secret', secret: true },
    ],
  },
  {
    id: 'PAYPAL',
    label: 'PayPal',
    blurb: 'PayPal balance and cards.',
    fields: [
      { key: 'clientId', label: 'Client ID', secret: false },
      { key: 'clientSecret', label: 'Client secret', secret: true },
    ],
  },
] as const

export interface ConfiguredProvider {
  provider: string
  displayName: string
  isEnabled: boolean
  testMode: boolean
  instructions: string | null
  credentialPreview: Record<string, string>
}

export function PaymentSettings({
  configured,
}: {
  configured: ConfiguredProvider[]
}) {
  const byProvider = new Map(configured.map((entry) => [entry.provider, entry]))

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Only Stripe, cash on delivery and bank transfer are wired end to end so
        far. The others store their keys but do not yet complete a payment —
        leave them switched off until their flow is implemented.
      </p>

      {PROVIDERS.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          existing={byProvider.get(provider.id)}
        />
      ))}
    </div>
  )
}

function ProviderCard({
  provider,
  existing,
}: {
  provider: (typeof PROVIDERS)[number]
  existing?: ConfiguredProvider
}) {
  const bound = savePaymentProviderAction.bind(null)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    bound,
    undefined
  )
  const [open, setOpen] = useState(false)

  const isOffline =
    provider.id === 'CASH_ON_DELIVERY' || provider.id === 'MANUAL'

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
              <CreditCard className="size-4" />
            </span>
            <div>
              <p className="font-medium">
                {provider.label}{' '}
                {existing?.isEnabled && <Badge variant="lime">Enabled</Badge>}
                {existing?.testMode && existing.isEnabled && (
                  <Badge variant="secondary">Test mode</Badge>
                )}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {provider.blurb}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? 'Close' : existing ? 'Edit' : 'Set up'}
          </Button>
        </div>

        {open && (
          <form action={action} className="border-border/60 border-t pt-4">
            <input type="hidden" name="provider" value={provider.id} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${provider.id}-name`}>
                  Name shown at checkout
                </FieldLabel>
                <Input
                  id={`${provider.id}-name`}
                  name="displayName"
                  defaultValue={existing?.displayName ?? provider.label}
                  required
                />
              </Field>

              {provider.fields.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`${provider.id}-${field.key}`}>
                    {field.label}
                  </FieldLabel>
                  <Input
                    id={`${provider.id}-${field.key}`}
                    name={`credential.${field.key}`}
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    placeholder={
                      existing?.credentialPreview[field.key] ??
                      (field.secret ? 'Never shown again once saved' : '')
                    }
                  />
                  {existing?.credentialPreview[field.key] && (
                    <FieldDescription>
                      Currently {existing.credentialPreview[field.key]}. Leave
                      empty to keep it.
                    </FieldDescription>
                  )}
                </Field>
              ))}

              {isOffline && (
                <Field>
                  <FieldLabel htmlFor={`${provider.id}-instructions`}>
                    Instructions for the customer
                  </FieldLabel>
                  <Textarea
                    id={`${provider.id}-instructions`}
                    name="instructions"
                    rows={3}
                    defaultValue={existing?.instructions ?? ''}
                    placeholder="Bank: … Account: … Reference your order number."
                  />
                </Field>
              )}

              <label className="flex items-center gap-2 text-sm">
                <Switch name="isEnabled" defaultChecked={existing?.isEnabled} />
                Offer this at checkout
              </label>

              {!isOffline && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    name="testMode"
                    defaultChecked={existing?.testMode ?? true}
                  />
                  Test mode
                </label>
              )}

              {state?.error && <FieldError>{state.error}</FieldError>}
              {state?.success && (
                <p className="text-muted-foreground text-sm">{state.success}</p>
              )}

              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Save'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
