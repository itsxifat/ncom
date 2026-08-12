'use client'

import { useActionState } from 'react'
import {
  updateOrganizationSettingsAction,
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
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '@/components/app/settings-section'
import { FormSelect } from '@/components/store/form-controls'

export interface StoreSettingsValues {
  currencyCode: string
  weightUnit: 'GRAM' | 'KILOGRAM' | 'OUNCE' | 'POUND'
  pricesIncludeTax: boolean
  taxesIncludedInShipping: boolean
  customerAccountsEnabled: boolean
  requiresCustomerAccount: boolean
  allowOutOfStockPurchase: boolean
  orderNumberPrefix: string
  orderNumberSuffix: string
  supportEmail: string
  supportPhone: string
  businessName: string
}

export function StoreSettingsForm({
  settings,
  locked,
}: {
  settings: StoreSettingsValues
  /** True once the store has orders: currency and tax basis can no longer move. */
  locked: boolean
}) {
  const boundAction = updateOrganizationSettingsAction
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  return (
    <form action={action} className="flex flex-col gap-10">
      <SettingsSection
        title="Business"
        description="Shown on receipts and your storefront's contact details."
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="businessName">Business name</FieldLabel>
            <Input
              id="businessName"
              name="businessName"
              defaultValue={settings.businessName}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supportEmail">Support email</FieldLabel>
              <Input
                id="supportEmail"
                name="supportEmail"
                type="email"
                defaultValue={settings.supportEmail}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supportPhone">Support phone</FieldLabel>
              <Input
                id="supportPhone"
                name="supportPhone"
                defaultValue={settings.supportPhone}
              />
            </Field>
          </div>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="Currency and units"
        description={
          locked
            ? 'Currency and tax basis are locked because this store has orders recorded in them.'
            : 'Set these before you take your first order — they cannot be changed afterwards.'
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="currencyCode">Currency</FieldLabel>
            <Input
              id="currencyCode"
              name="currencyCode"
              defaultValue={settings.currencyCode}
              maxLength={3}
              disabled={locked}
              className="uppercase"
            />
            {/* A disabled input posts nothing, which would fail the schema —
                so the current value rides along in a hidden field. */}
            {locked && (
              <input
                type="hidden"
                name="currencyCode"
                value={settings.currencyCode}
              />
            )}
            <FieldDescription>
              Three-letter ISO code, like USD.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="weightUnit">Weight unit</FieldLabel>
            <FormSelect
              id="weightUnit"
              name="weightUnit"
              defaultValue={settings.weightUnit}
            >
              <option value="GRAM">Grams</option>
              <option value="KILOGRAM">Kilograms</option>
              <option value="OUNCE">Ounces</option>
              <option value="POUND">Pounds</option>
            </FormSelect>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              name="pricesIncludeTax"
              defaultChecked={settings.pricesIncludeTax}
              disabled={locked}
            />
            Product prices already include tax
          </label>
          {locked && settings.pricesIncludeTax && (
            <input type="hidden" name="pricesIncludeTax" value="on" />
          )}

          <label className="flex items-center gap-2 text-sm">
            <Switch
              name="taxesIncludedInShipping"
              defaultChecked={settings.taxesIncludedInShipping}
            />
            Shipping rates already include tax
          </label>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="Checkout"
        description="How customers identify themselves and what they can buy."
      >
        <FieldGroup>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              name="customerAccountsEnabled"
              defaultChecked={settings.customerAccountsEnabled}
            />
            Allow customers to create accounts
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              name="requiresCustomerAccount"
              defaultChecked={settings.requiresCustomerAccount}
            />
            Require an account to check out
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              name="allowOutOfStockPurchase"
              defaultChecked={settings.allowOutOfStockPurchase}
            />
            Allow buying items that are out of stock
          </label>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="Order numbers"
        description="Numbering restarts per store, so your first order is #1001 regardless of platform volume."
      >
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="orderNumberPrefix">Prefix</FieldLabel>
              <Input
                id="orderNumberPrefix"
                name="orderNumberPrefix"
                defaultValue={settings.orderNumberPrefix}
                maxLength={10}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="orderNumberSuffix">Suffix</FieldLabel>
              <Input
                id="orderNumberSuffix"
                name="orderNumberSuffix"
                defaultValue={settings.orderNumberSuffix}
                maxLength={10}
              />
            </Field>
          </div>
        </FieldGroup>
      </SettingsSection>

      <Card>
        <CardContent>
          <FieldGroup>
            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save settings'}
              </Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}
