'use client'

import { useActionState } from 'react'
import { createStoreAction } from '@/app/(dashboard)/stores/actions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/store/form-controls'

/**
 * Currencies offered at store creation. Deliberately a short, curated list
 * rather than all 180 ISO codes: a merchant who needs something else can be
 * added here, whereas a 180-item dropdown makes the common case worse.
 */
const CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'BDT', label: 'Bangladeshi Taka (BDT)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'PKR', label: 'Pakistani Rupee (PKR)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
  { code: 'MYR', label: 'Malaysian Ringgit (MYR)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
]
import { Button } from '@/components/ui/button'

export function NewStoreForm({
  rootDomain,
}: {
  /** `env.ROOT_DOMAIN`, passed in because `env` is server-only. */
  rootDomain: string
}) {
  const [state, action, pending] = useActionState(createStoreAction, undefined)

  return (
    <div className="mx-auto w-full max-w-lg py-4 sm:py-10">
      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold tracking-tight">
            New store
          </CardTitle>
          <CardDescription>
            Give your landing page store a name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Store name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder="Acme Supply Co."
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subdomain">
                  Subdomain (optional)
                </FieldLabel>
                <Input id="subdomain" name="subdomain" placeholder="acme" />
                <FieldDescription>
                  Leave blank to generate one from the store name. Your store
                  will be reachable at <code>subdomain.{rootDomain}</code>.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="currencyCode">Currency</FieldLabel>
                <FormSelect
                  id="currencyCode"
                  name="currencyCode"
                  defaultValue="USD"
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </FormSelect>
                <FieldDescription>
                  Every order is recorded in this currency, so it cannot be
                  changed once the store has taken its first sale.
                </FieldDescription>
              </Field>
              {state?.error && <FieldError>{state.error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Creating…' : 'Create store'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
