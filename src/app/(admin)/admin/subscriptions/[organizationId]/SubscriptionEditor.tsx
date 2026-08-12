'use client'

import { useActionState, useState, useTransition } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import {
  activateOrderAction,
  cancelOrderAction,
  resetUsageAction,
  saveSubscriptionAction,
  setAddonQuantityAction,
  type SubscriptionFormState,
} from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { FormSelect, Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'

export interface SubscriptionEditorData {
  organizationId: string
  organizationName: string
  planId: string
  interval: string
  status: string
  currencyCode: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  overrideMaxPages: number | null
  overrideMaxStores: number | null
  overrideMaxCustomDomains: number | null
  overrideMaxTeamMembers: number | null
  overrideStorageMb: number | null
  overrideMonthlyTrafficMb: number | null
  quotaEnforcementDisabled: boolean
  adminNote: string | null
  addons: { addonId: string; quantity: number }[]
  orders: {
    id: string
    planName: string
    status: string
    totalCents: number
    currencyCode: string
    couponCode: string | null
    createdAt: string
    interval: string
  }[]
}

/**
 * A fingerprint of the persisted values this form renders, used as its `key`.
 *
 * Every mutation on this page calls `revalidatePath`, so a fresh `data` object
 * lands on an already-mounted form. Uncontrolled fields ignore a changed
 * `defaultValue` — they would keep showing pre-save values, and Base UI warns
 * about the default shifting underneath it. Remounting re-seeds them from server
 * truth.
 *
 * Deliberately covers only the fields inside the form: a revalidation triggered
 * by an add-on quantity or a usage reset touches none of them, so it leaves
 * unsaved edits alone instead of wiping the form under the admin mid-sentence.
 */
const NON_FORM_KEYS = new Set<keyof SubscriptionEditorData>([
  'organizationId',
  'organizationName',
  'currencyCode',
  'addons',
  'orders',
])

function formFingerprint(data: SubscriptionEditorData) {
  return JSON.stringify(
    Object.entries(data).filter(
      ([key]) => !NON_FORM_KEYS.has(key as keyof SubscriptionEditorData)
    )
  )
}

const STATUSES = [
  'ACTIVE',
  'TRIALING',
  'PENDING',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
] as const

function OverrideField({
  name,
  label,
  value,
  planValue,
  unit,
}: {
  name: string
  label: string
  value: number | null
  planValue: string
  unit?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        inputMode="numeric"
        defaultValue={value === null ? '' : String(value)}
        placeholder={`Plan: ${planValue}`}
      />
      <FieldDescription>
        {unit ? `${unit}. ` : ''}Empty inherits the plan.
      </FieldDescription>
    </Field>
  )
}

export function SubscriptionEditor({
  data,
  plans,
  addons,
  planLimits,
}: {
  data: SubscriptionEditorData
  plans: { id: string; name: string }[]
  addons: {
    id: string
    name: string
    monthlyPriceCents: number
    currencyCode: string
    maxQuantity: number | null
  }[]
  planLimits: Record<string, string>
}) {
  const [state, action, pending] = useActionState<
    SubscriptionFormState,
    FormData
  >(saveSubscriptionAction, undefined)
  const [isPending, startTransition] = useTransition()
  const [rowError, setRowError] = useState<string | null>(null)

  const addonQuantity = (addonId: string) =>
    data.addons.find((line) => line.addonId === addonId)?.quantity ?? 0

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <form action={action} key={formFingerprint(data)}>
        <input
          type="hidden"
          name="organizationId"
          value={data.organizationId}
        />

        <div className="flex flex-col gap-6">
          <SettingsSection
            title="Plan"
            description="Changing this here takes effect immediately and records an audit entry — no order and no payment."
          >
            <Card>
              <CardContent>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="planId">Plan</FieldLabel>
                      <FormSelect
                        id="planId"
                        name="planId"
                        defaultValue={data.planId}
                      >
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </FormSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="interval">Billing period</FieldLabel>
                      <FormSelect
                        id="interval"
                        name="interval"
                        defaultValue={data.interval}
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="ANNUAL">Annual</option>
                      </FormSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="status">Status</FieldLabel>
                      <FormSelect
                        id="status"
                        name="status"
                        defaultValue={data.status}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status.toLowerCase()}
                          </option>
                        ))}
                      </FormSelect>
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="currentPeriodEnd">
                        Period ends
                      </FieldLabel>
                      <Input
                        id="currentPeriodEnd"
                        name="currentPeriodEnd"
                        type="datetime-local"
                        defaultValue={data.currentPeriodEnd?.slice(0, 16) ?? ''}
                      />
                      <FieldDescription>
                        Empty = never renews (free plans).
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="trialEndsAt">Trial ends</FieldLabel>
                      <Input
                        id="trialEndsAt"
                        name="trialEndsAt"
                        type="datetime-local"
                        defaultValue={data.trialEndsAt?.slice(0, 16) ?? ''}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </CardContent>
            </Card>
          </SettingsSection>

          <SettingsSection
            title="Limit overrides"
            description="For a bespoke deal or a migration. These replace the plan's numbers for this workspace only; add-ons still stack on top."
          >
            <Card>
              <CardContent>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <OverrideField
                      name="overrideMaxPages"
                      label="Landing pages"
                      value={data.overrideMaxPages}
                      planValue={planLimits.pages ?? '—'}
                    />
                    <OverrideField
                      name="overrideMaxStores"
                      label="Sites"
                      value={data.overrideMaxStores}
                      planValue={planLimits.stores ?? '—'}
                    />
                    <OverrideField
                      name="overrideMaxCustomDomains"
                      label="Custom domains"
                      value={data.overrideMaxCustomDomains}
                      planValue={planLimits.domains ?? '—'}
                    />
                    <OverrideField
                      name="overrideMaxTeamMembers"
                      label="Team members"
                      value={data.overrideMaxTeamMembers}
                      planValue={planLimits.members ?? '—'}
                    />
                    <OverrideField
                      name="overrideStorageMb"
                      label="Storage"
                      unit="MB"
                      value={data.overrideStorageMb}
                      planValue={planLimits.storage ?? '—'}
                    />
                    <OverrideField
                      name="overrideMonthlyTrafficMb"
                      label="Monthly traffic"
                      unit="MB"
                      value={data.overrideMonthlyTrafficMb}
                      planValue={planLimits.traffic ?? '—'}
                    />
                  </div>

                  <label className="border-destructive/30 bg-destructive/5 flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                    <input
                      type="checkbox"
                      name="quotaEnforcementDisabled"
                      defaultChecked={data.quotaEnforcementDisabled}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Waive all limits for this workspace
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        Every quota check passes. Feature gates still apply.
                        Intended for an incident or a migration, not as a
                        permanent setting.
                      </span>
                    </span>
                  </label>

                  <Field>
                    <FieldLabel htmlFor="adminNote">Internal note</FieldLabel>
                    <Textarea
                      id="adminNote"
                      name="adminNote"
                      rows={2}
                      defaultValue={data.adminNote ?? ''}
                      placeholder="Why this workspace has non-standard limits"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </SettingsSection>

          {state?.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
          {state?.notice && (
            <p className="text-sm text-emerald-600">{state.notice}</p>
          )}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save subscription'}
            </Button>
          </div>
        </div>
      </form>

      <SettingsSection
        title="Add-ons"
        description="Granted directly, without an order. Set a quantity to 0 to remove it."
      >
        <ListPanel>
          {addons.map((addon) => {
            const quantity = addonQuantity(addon.id)
            return (
              <ListRow key={addon.id}>
                <ListRowText
                  title={addon.name}
                  meta={`${formatMoney(addon.monthlyPriceCents, addon.currencyCode)}/mo${addon.maxQuantity === 1 ? ' · switch' : ''}`}
                  badges={
                    quantity > 0 ? (
                      <Badge variant="secondary">×{quantity}</Badge>
                    ) : null
                  }
                />
                <ListRowActions>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const form = event.currentTarget
                      const value = Number(
                        new FormData(form).get('quantity') ?? 0
                      )
                      startTransition(async () => {
                        const result = await setAddonQuantityAction({
                          organizationId: data.organizationId,
                          addonId: addon.id,
                          quantity: Number.isFinite(value) ? value : 0,
                        })
                        setRowError(result.error ?? null)
                      })
                    }}
                  >
                    <Input
                      name="quantity"
                      inputMode="numeric"
                      defaultValue={String(quantity)}
                      className="h-8 w-16 text-center"
                      aria-label={`${addon.name} quantity`}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                    >
                      Set
                    </Button>
                  </form>
                </ListRowActions>
              </ListRow>
            )
          })}
        </ListPanel>
      </SettingsSection>

      <SettingsSection
        title="Orders"
        description="Checkout history. Activating an order applies its plan and marks it paid."
      >
        {data.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders yet.</p>
        ) : (
          <ListPanel>
            {data.orders.map((order) => (
              <ListRow key={order.id}>
                <ListRowText
                  title={`${order.planName} · ${order.interval === 'ANNUAL' ? 'annual' : 'monthly'}`}
                  meta={
                    <>
                      {new Date(order.createdAt).toLocaleString()}
                      {order.couponCode && ` · ${order.couponCode}`}
                    </>
                  }
                  badges={
                    <Badge
                      variant={
                        order.status === 'AWAITING_PAYMENT'
                          ? 'outline'
                          : 'secondary'
                      }
                    >
                      {order.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  }
                />
                <ListRowActions>
                  <Money>
                    {formatMoney(order.totalCents, order.currencyCode)}
                  </Money>
                  {order.status === 'AWAITING_PAYMENT' && (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await activateOrderAction(
                              order.id,
                              data.organizationId
                            )
                            setRowError(result.error ?? null)
                          })
                        }
                      >
                        <Check /> Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await cancelOrderAction(
                              order.id,
                              data.organizationId
                            )
                            setRowError(result.error ?? null)
                          })
                        }
                      >
                        <X /> Cancel
                      </Button>
                    </>
                  )}
                </ListRowActions>
              </ListRow>
            ))}
          </ListPanel>
        )}
      </SettingsSection>

      <SettingsSection
        title="Usage"
        description="Clearing this month's traffic and visitor counters restores a site that was paused by its cap. Stored media is counted live and cannot be reset."
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Clear this month's traffic and visitor counters for ${data.organizationName}?`
                )
              ) {
                return
              }
              startTransition(async () => {
                const result = await resetUsageAction(data.organizationId)
                setRowError(result.error ?? null)
              })
            }}
          >
            <RotateCcw />
            Reset this month&apos;s usage
          </Button>
          {rowError && <FieldError>{rowError}</FieldError>}
        </div>
      </SettingsSection>
    </div>
  )
}
