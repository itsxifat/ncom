'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { savePlanAction, type PlanFormState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { SettingsSection } from '@/components/app/settings-section'
import { FormSelect, MoneyInput } from '@/components/store/form-controls'
import {
  AVAILABILITY_LABELS,
  BASELINE_FEATURE_LABELS,
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_PLAN_COLUMN,
  SUPPORT_TIER_LABELS,
} from '@/lib/plans'
import { centsToMajorString } from '@/lib/money'
import type { PlanModel } from '@/generated/prisma/models'

/**
 * The plan editor.
 *
 * Long by nature — a plan is thirty-odd knobs and the whole point of this feature
 * is that all of them are editable without a deploy. It is kept legible by
 * grouping into the same sections the price sheet uses (identity, price, limits,
 * features, support) and by three small field components below, so each field is
 * one line here rather than six.
 *
 * Uncontrolled inputs with `defaultValue`: this is a save-on-submit form, so
 * controlling thirty fields in React state would add re-renders and a
 * synchronisation bug surface for no benefit.
 */

/** Empty means unlimited. Spelled out on every limit field, because it matters. */
function QuotaField({
  name,
  label,
  value,
  unit,
  error,
}: {
  name: string
  label: string
  value: number | null
  unit?: string
  error?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        inputMode="numeric"
        defaultValue={value === null ? '' : String(value)}
        placeholder="Unlimited"
      />
      <FieldDescription>
        {unit ? `${unit}. ` : ''}Empty = unlimited, 0 = not allowed.
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function AvailabilityField({
  name,
  label,
  value,
}: {
  name: string
  label: string
  value: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <FormSelect id={name} name={name} defaultValue={value}>
        {Object.entries(AVAILABILITY_LABELS).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </FormSelect>
    </Field>
  )
}

function ToggleField({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string
  label: string
  description?: string
  defaultChecked: boolean
}) {
  return (
    <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-xl p-2 transition-colors">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="text-muted-foreground block text-xs">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}

export function PlanForm({ plan }: { plan: PlanModel | null }) {
  const [state, action, pending] = useActionState<PlanFormState, FormData>(
    savePlanAction.bind(null, plan?.id ?? null),
    undefined
  )

  const currency = plan?.currencyCode ?? 'BDT'
  const errors = state?.fieldErrors ?? {}

  return (
    <form action={action} className="flex max-w-4xl flex-col gap-6">
      <SettingsSection
        title="Identity"
        description="How the plan is named on the pricing page and referred to in code."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={plan?.name ?? ''}
                    required
                  />
                  {errors.name && <FieldError>{errors.name}</FieldError>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="code">Code</FieldLabel>
                  <Input
                    id="code"
                    name="code"
                    defaultValue={plan?.code ?? ''}
                    placeholder="STARTER"
                    className="font-mono"
                    required
                  />
                  <FieldDescription>
                    Permanent identifier. Changing it breaks anything referring
                    to the old value.
                  </FieldDescription>
                  {errors.code && <FieldError>{errors.code}</FieldError>}
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="tagline">Tagline</FieldLabel>
                <Input
                  id="tagline"
                  name="tagline"
                  defaultValue={plan?.tagline ?? ''}
                  placeholder="Your own domain, premium templates and analytics."
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="position">Sort order</FieldLabel>
                  <Input
                    id="position"
                    name="position"
                    inputMode="numeric"
                    defaultValue={String(plan?.position ?? 0)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="supportTier">Support tier</FieldLabel>
                  <FormSelect
                    id="supportTier"
                    name="supportTier"
                    defaultValue={plan?.supportTier ?? 'COMMUNITY'}
                  >
                    {Object.entries(SUPPORT_TIER_LABELS).map(([key, text]) => (
                      <option key={key} value={key}>
                        {text}
                      </option>
                    ))}
                  </FormSelect>
                </Field>
              </div>

              <div className="grid gap-1 sm:grid-cols-2">
                <ToggleField
                  name="isActive"
                  label="Active"
                  description="Off hides it and blocks new subscriptions."
                  defaultChecked={plan?.isActive ?? true}
                />
                <ToggleField
                  name="isPublic"
                  label="Show on pricing page"
                  defaultChecked={plan?.isPublic ?? true}
                />
                <ToggleField
                  name="isDefault"
                  label="Default for new signups"
                  description="Only one plan can hold this."
                  defaultChecked={plan?.isDefault ?? false}
                />
                <ToggleField
                  name="isContactSalesOnly"
                  label="Contact sales only"
                  description="Shows “Contact sales” instead of a checkout button."
                  defaultChecked={plan?.isContactSalesOnly ?? false}
                />
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="Price"
        description="Amounts in major units — enter 399 for ৳399. Leave the annual price empty if the plan is monthly only."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="currencyCode">Currency</FieldLabel>
                  <Input
                    id="currencyCode"
                    name="currencyCode"
                    defaultValue={currency}
                    maxLength={3}
                    className="font-mono uppercase"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="monthlyPrice">Monthly</FieldLabel>
                  <MoneyInput
                    id="monthlyPrice"
                    name="monthlyPrice"
                    currencyCode={currency}
                    defaultValue={centsToMajorString(
                      plan?.monthlyPriceCents ?? 0,
                      currency
                    )}
                  />
                  {errors.monthlyPrice && (
                    <FieldError>{errors.monthlyPrice}</FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="annualPrice">Annual</FieldLabel>
                  <MoneyInput
                    id="annualPrice"
                    name="annualPrice"
                    currencyCode={currency}
                    defaultValue={centsToMajorString(
                      plan?.annualPriceCents ?? null,
                      currency
                    )}
                  />
                  <FieldDescription>
                    Empty = not offered yearly.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="trialDays">Trial days</FieldLabel>
                <Input
                  id="trialDays"
                  name="trialDays"
                  inputMode="numeric"
                  defaultValue={String(plan?.trialDays ?? 0)}
                />
                <FieldDescription>
                  0 = no trial. Subscriptions start ACTIVE instead of TRIALING.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="Limits"
        description="Enforced on every create, upload and invitation. Add-ons stack on top of these."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <QuotaField
                  name="maxPages"
                  label="Landing pages"
                  value={plan?.maxPages ?? null}
                />
                <QuotaField
                  name="maxStores"
                  label="Sites"
                  value={plan?.maxStores ?? null}
                />
                <QuotaField
                  name="maxCustomDomains"
                  label="Custom domains"
                  value={plan?.maxCustomDomains ?? 0}
                />
                <QuotaField
                  name="maxTeamMembers"
                  label="Team members"
                  value={plan?.maxTeamMembers ?? 1}
                />
                <QuotaField
                  name="storageMb"
                  label="Media storage"
                  unit="MB"
                  value={plan?.storageMb ?? null}
                />
                <QuotaField
                  name="monthlyTrafficMb"
                  label="Monthly traffic"
                  unit="MB"
                  value={plan?.monthlyTrafficMb ?? null}
                />
                <QuotaField
                  name="monthlyVisitors"
                  label="Monthly visitors"
                  value={plan?.monthlyVisitors ?? null}
                />
              </div>

              <Field>
                <FieldLabel htmlFor="fairUseNote">
                  Fair-use note (the asterisk on “Unlimited*”)
                </FieldLabel>
                <Textarea
                  id="fairUseNote"
                  name="fairUseNote"
                  rows={2}
                  defaultValue={plan?.fairUseNote ?? ''}
                />
              </Field>

              <div className="grid gap-1 sm:grid-cols-2">
                <ToggleField
                  name="enforceTrafficCap"
                  label="Pause sites over the traffic limit"
                  description="Only applies when a traffic limit is set."
                  defaultChecked={plan?.enforceTrafficCap ?? true}
                />
                <ToggleField
                  name="enforceVisitorCap"
                  label="Pause sites over the visitor limit"
                  description="Off by default — the visitor figure is a recommendation."
                  defaultChecked={plan?.enforceVisitorCap ?? false}
                />
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="Features"
        description="“Optional add-on” means the tenant can buy it on this plan; “Not included” means it isn't sold at this tier at all."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                {FEATURE_KEYS.map((key) => (
                  <AvailabilityField
                    key={key}
                    name={FEATURE_PLAN_COLUMN[key]}
                    label={FEATURE_LABELS[key]}
                    value={plan?.[FEATURE_PLAN_COLUMN[key]] ?? 'UNAVAILABLE'}
                  />
                ))}
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  Included on every tier today — untick to sell a tier without
                  one.
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {Object.entries(BASELINE_FEATURE_LABELS).map(
                    ([key, label]) => (
                      <ToggleField
                        key={key}
                        name={key}
                        label={label}
                        defaultChecked={
                          plan ? Boolean(plan[key as keyof PlanModel]) : true
                        }
                      />
                    )
                  )}
                </div>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
        </Button>
        <Button variant="ghost" render={<Link href="/admin/plans" />}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
