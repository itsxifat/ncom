'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { saveCouponAction, type CouponFormState } from './actions'
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
import { centsToMajorString } from '@/lib/money'

/**
 * The coupon editor.
 *
 * Rules are grouped by the question they answer — what it takes off, how long it
 * lasts, who may use it, how many times — because a flat list of twenty-five
 * fields is unreadable and the interactions between them are what an operator
 * gets wrong.
 *
 * Two things are controlled state rather than uncontrolled: the discount type and
 * the duration. Both change which other fields are meaningful, and showing a
 * percentage box on a fixed-amount coupon is how you end up with a coupon that
 * takes off nothing.
 */

export interface CouponFormValues {
  id: string
  code: string
  name: string | null
  description: string | null
  isActive: boolean
  discountType: string
  percentageBps: number | null
  amountCents: number | null
  freeTrialDays: number | null
  currencyCode: string
  duration: string
  durationMonths: number | null
  appliesToAllPlans: boolean
  appliesToAddons: boolean
  allowedIntervals: string[]
  newOrganizationsOnly: boolean
  firstPurchaseOnly: boolean
  existingCustomersOnly: boolean
  existingBeforeAt: string | null
  minSubtotalCents: number | null
  minTermMonths: number | null
  requiresVerifiedEmail: boolean
  restrictedToOrganizationIds: string[]
  restrictedToEmails: string[]
  restrictedToEmailDomain: string | null
  maxRedemptions: number | null
  maxRedemptionsPerOrg: number | null
  redeemedCount: number
  startsAt: string | null
  endsAt: string | null
  isStackable: boolean
  planIds: string[]
}

const DISCOUNT_TYPES = [
  { value: 'FREE', label: '100% off — free' },
  { value: 'PERCENTAGE', label: 'Percentage off' },
  { value: 'FIXED_AMOUNT', label: 'Fixed amount off' },
  { value: 'OVERRIDE_PRICE', label: 'Fixed final price' },
  { value: 'FREE_TRIAL_DAYS', label: 'Extra trial days' },
]

const DURATIONS = [
  { value: 'FOREVER', label: 'Forever — every renewal' },
  { value: 'ONCE', label: 'First period only' },
  { value: 'REPEATING', label: 'A set number of periods' },
]

function Toggle({
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
    <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-xl p-2">
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

/** `datetime-local` needs `YYYY-MM-DDTHH:mm`, which is not what toISOString gives. */
function toLocalInputValue(value: string | null): string {
  if (!value) return ''
  return value.slice(0, 16)
}

export function CouponForm({
  coupon,
  plans,
}: {
  coupon: CouponFormValues | null
  plans: { id: string; name: string }[]
}) {
  const [state, action, pending] = useActionState<CouponFormState, FormData>(
    saveCouponAction.bind(null, coupon?.id ?? null),
    undefined
  )

  const [discountType, setDiscountType] = useState(
    coupon?.discountType ?? 'FREE'
  )
  const [duration, setDuration] = useState(coupon?.duration ?? 'FOREVER')
  const [allPlans, setAllPlans] = useState(coupon?.appliesToAllPlans ?? true)

  const currency = coupon?.currencyCode ?? 'BDT'
  const errors = state?.fieldErrors ?? {}

  return (
    <form action={action} className="flex max-w-4xl flex-col gap-6">
      <SettingsSection title="The code" description="What the customer types.">
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="code">Code</FieldLabel>
                  <Input
                    id="code"
                    name="code"
                    defaultValue={coupon?.code ?? ''}
                    placeholder="NCOMEXPLORE"
                    className="font-mono uppercase"
                    required
                  />
                  <FieldDescription>
                    Case-insensitive for customers — stored upper-case.
                  </FieldDescription>
                  {errors.code && <FieldError>{errors.code}</FieldError>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="name">Internal name</FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={coupon?.name ?? ''}
                    placeholder="Launch — existing customers"
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="description">
                  Description (shown at checkout)
                </FieldLabel>
                <Textarea
                  id="description"
                  name="description"
                  rows={2}
                  defaultValue={coupon?.description ?? ''}
                />
              </Field>

              <Toggle
                name="isActive"
                label="Active"
                description="Off refuses the code without deleting its history."
                defaultChecked={coupon?.isActive ?? true}
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="What it takes off"
        description="Only the fields relevant to the chosen type are used."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="discountType">Type</FieldLabel>
                  <FormSelect
                    id="discountType"
                    name="discountType"
                    value={discountType}
                    onChange={(event) => setDiscountType(event.target.value)}
                  >
                    {DISCOUNT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </FormSelect>
                </Field>

                {discountType === 'PERCENTAGE' && (
                  <Field>
                    <FieldLabel htmlFor="percentage">Percentage off</FieldLabel>
                    <Input
                      id="percentage"
                      name="percentage"
                      inputMode="decimal"
                      defaultValue={
                        coupon?.percentageBps === null || !coupon
                          ? ''
                          : String(coupon.percentageBps / 100)
                      }
                      placeholder="25"
                    />
                    {errors.percentage && (
                      <FieldError>{errors.percentage}</FieldError>
                    )}
                  </Field>
                )}

                {(discountType === 'FIXED_AMOUNT' ||
                  discountType === 'OVERRIDE_PRICE') && (
                  <Field>
                    <FieldLabel htmlFor="amount">
                      {discountType === 'OVERRIDE_PRICE'
                        ? 'Final price'
                        : 'Amount off'}
                    </FieldLabel>
                    <MoneyInput
                      id="amount"
                      name="amount"
                      currencyCode={currency}
                      defaultValue={centsToMajorString(
                        coupon?.amountCents ?? null,
                        currency
                      )}
                    />
                    {errors.amount && <FieldError>{errors.amount}</FieldError>}
                  </Field>
                )}

                {discountType === 'FREE_TRIAL_DAYS' && (
                  <Field>
                    <FieldLabel htmlFor="freeTrialDays">Trial days</FieldLabel>
                    <Input
                      id="freeTrialDays"
                      name="freeTrialDays"
                      inputMode="numeric"
                      defaultValue={
                        coupon?.freeTrialDays === null || !coupon
                          ? ''
                          : String(coupon.freeTrialDays)
                      }
                    />
                    {errors.freeTrialDays && (
                      <FieldError>{errors.freeTrialDays}</FieldError>
                    )}
                  </Field>
                )}
              </div>

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
                  <FieldDescription>
                    Amount coupons only apply to plans in the same currency.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="duration">Lasts</FieldLabel>
                  <FormSelect
                    id="duration"
                    name="duration"
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                  >
                    {DURATIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormSelect>
                </Field>
                {duration === 'REPEATING' && (
                  <Field>
                    <FieldLabel htmlFor="durationMonths">
                      Number of periods
                    </FieldLabel>
                    <Input
                      id="durationMonths"
                      name="durationMonths"
                      inputMode="numeric"
                      defaultValue={
                        coupon?.durationMonths === null || !coupon
                          ? ''
                          : String(coupon.durationMonths)
                      }
                    />
                    {errors.durationMonths && (
                      <FieldError>{errors.durationMonths}</FieldError>
                    )}
                  </Field>
                )}
              </div>

              <Toggle
                name="appliesToAddons"
                label="Discount add-ons too"
                description="Off discounts only the plan price."
                defaultChecked={coupon?.appliesToAddons ?? false}
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="Who can use it"
        description="Every rule set here has to pass. Leave a rule alone to ignore it."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="appliesToAllPlans"
                  checked={allPlans}
                  onChange={(event) => setAllPlans(event.target.checked)}
                  className="mt-0.5 size-4"
                />
                Valid on every plan
              </label>

              {!allPlans && (
                <Field>
                  <FieldLabel>Valid on</FieldLabel>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {plans.map((plan) => (
                      <label
                        key={plan.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="planIds"
                          value={plan.id}
                          defaultChecked={
                            coupon?.planIds.includes(plan.id) ?? false
                          }
                          className="size-4"
                        />
                        {plan.name}
                      </label>
                    ))}
                  </div>
                  {errors.planIds && <FieldError>{errors.planIds}</FieldError>}
                </Field>
              )}

              <Field>
                <FieldLabel>Billing periods</FieldLabel>
                <div className="flex gap-4">
                  {(['MONTHLY', 'ANNUAL'] as const).map((interval) => (
                    <label
                      key={interval}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="allowedIntervals"
                        value={interval}
                        defaultChecked={
                          coupon?.allowedIntervals.includes(interval) ?? false
                        }
                        className="size-4"
                      />
                      {interval === 'MONTHLY' ? 'Monthly' : 'Annual'}
                    </label>
                  ))}
                </div>
                <FieldDescription>Tick none to allow both.</FieldDescription>
              </Field>

              <div className="grid gap-1 sm:grid-cols-2">
                <Toggle
                  name="existingCustomersOnly"
                  label="Existing customers only"
                  description="Workspaces created before the cutoff below."
                  defaultChecked={coupon?.existingCustomersOnly ?? false}
                />
                <Toggle
                  name="newOrganizationsOnly"
                  label="First-time subscribers only"
                  description="Never activated a paid plan before."
                  defaultChecked={coupon?.newOrganizationsOnly ?? false}
                />
                <Toggle
                  name="firstPurchaseOnly"
                  label="First checkout only"
                  description="No previous order of any kind."
                  defaultChecked={coupon?.firstPurchaseOnly ?? false}
                />
                <Toggle
                  name="requiresVerifiedEmail"
                  label="Verified email required"
                  defaultChecked={coupon?.requiresVerifiedEmail ?? false}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="existingBeforeAt">
                    Existing-customer cutoff
                  </FieldLabel>
                  <Input
                    id="existingBeforeAt"
                    name="existingBeforeAt"
                    type="datetime-local"
                    defaultValue={toLocalInputValue(
                      coupon?.existingBeforeAt ?? null
                    )}
                  />
                  <FieldDescription>
                    Empty = when the coupon was created.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="minSubtotal">
                    Minimum subtotal
                  </FieldLabel>
                  <MoneyInput
                    id="minSubtotal"
                    name="minSubtotal"
                    currencyCode={currency}
                    defaultValue={centsToMajorString(
                      coupon?.minSubtotalCents ?? null,
                      currency
                    )}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="minTermMonths">
                    Minimum term (months)
                  </FieldLabel>
                  <Input
                    id="minTermMonths"
                    name="minTermMonths"
                    inputMode="numeric"
                    defaultValue={
                      coupon?.minTermMonths === null || !coupon
                        ? ''
                        : String(coupon.minTermMonths)
                    }
                    placeholder="Any"
                  />
                  <FieldDescription>12 = annual only.</FieldDescription>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="restrictedToEmails">
                    Only these emails
                  </FieldLabel>
                  <Textarea
                    id="restrictedToEmails"
                    name="restrictedToEmails"
                    rows={2}
                    defaultValue={coupon?.restrictedToEmails.join(', ') ?? ''}
                    placeholder="one@example.com, two@example.com"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="restrictedToEmailDomain">
                    Only this email domain
                  </FieldLabel>
                  <Input
                    id="restrictedToEmailDomain"
                    name="restrictedToEmailDomain"
                    defaultValue={coupon?.restrictedToEmailDomain ?? ''}
                    placeholder="acme.com"
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="restrictedToOrganizationIds">
                  Only these workspace IDs
                </FieldLabel>
                <Textarea
                  id="restrictedToOrganizationIds"
                  name="restrictedToOrganizationIds"
                  rows={2}
                  defaultValue={
                    coupon?.restrictedToOrganizationIds.join(', ') ?? ''
                  }
                />
                <FieldDescription>
                  Comma separated. Copy IDs from the Subscriptions tab.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="Limits and window"
        description="How many times it can be used, and when."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="maxRedemptions">
                    Total redemptions
                  </FieldLabel>
                  <Input
                    id="maxRedemptions"
                    name="maxRedemptions"
                    inputMode="numeric"
                    defaultValue={
                      coupon?.maxRedemptions === null || !coupon
                        ? ''
                        : String(coupon.maxRedemptions)
                    }
                    placeholder="Unlimited"
                  />
                  {coupon && (
                    <FieldDescription>
                      Used {coupon.redeemedCount} times so far.
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="maxRedemptionsPerOrg">
                    Per workspace
                  </FieldLabel>
                  <Input
                    id="maxRedemptionsPerOrg"
                    name="maxRedemptionsPerOrg"
                    inputMode="numeric"
                    defaultValue={
                      coupon?.maxRedemptionsPerOrg === null || !coupon
                        ? ''
                        : String(coupon.maxRedemptionsPerOrg)
                    }
                    placeholder="Unlimited"
                  />
                  <FieldDescription>
                    Empty lets one workspace try several plans with it.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="startsAt">Starts</FieldLabel>
                  <Input
                    id="startsAt"
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={toLocalInputValue(coupon?.startsAt ?? null)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="endsAt">Ends</FieldLabel>
                  <Input
                    id="endsAt"
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={toLocalInputValue(coupon?.endsAt ?? null)}
                  />
                  {errors.endsAt && <FieldError>{errors.endsAt}</FieldError>}
                </Field>
              </div>

              <Toggle
                name="isStackable"
                label="Can combine with another coupon"
                defaultChecked={coupon?.isStackable ?? false}
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : coupon ? 'Save coupon' : 'Create coupon'}
        </Button>
        <Button variant="ghost" render={<Link href="/admin/coupons" />}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
