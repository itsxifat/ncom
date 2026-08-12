'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { Package, Plus, Trash2, X } from 'lucide-react'
import {
  deleteAddonAction,
  saveAddonAction,
  type AddonFormState,
} from './actions'
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
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { FormSelect, Money, MoneyInput } from '@/components/store/form-controls'
import { centsToMajorString, formatMoney } from '@/lib/money'
import { formatBytes } from '@/lib/plans'

export interface AddonListItem {
  id: string
  code: string
  name: string
  description: string | null
  position: number
  isActive: boolean
  currencyCode: string
  monthlyPriceCents: number
  annualPriceCents: number | null
  grantsCustomDomains: number
  grantsStorageMb: number
  grantsTrafficMb: number
  grantsTeamMembers: number
  grantsFeature: string | null
  maxQuantity: number | null
  availableOnAllPlans: boolean
  planIds: string[]
  subscriberCount: number
}

const GRANT_FEATURES = [
  { value: '', label: 'None — this add-on raises a limit' },
  { value: 'AI_CONTENT_ASSISTANT', label: 'AI content assistant' },
  { value: 'ADVANCED_ANALYTICS', label: 'Advanced analytics' },
  { value: 'PREMIUM_TEMPLATES', label: 'Premium templates' },
  { value: 'WHITE_LABEL', label: 'White label' },
]

/** One line describing what an add-on actually gives you. */
function grantSummary(addon: AddonListItem): string {
  const parts: string[] = []
  if (addon.grantsCustomDomains)
    parts.push(
      `+${addon.grantsCustomDomains} domain${addon.grantsCustomDomains > 1 ? 's' : ''}`
    )
  if (addon.grantsStorageMb)
    parts.push(`+${formatBytes(addon.grantsStorageMb * 1024 * 1024)} storage`)
  if (addon.grantsTrafficMb)
    parts.push(`+${formatBytes(addon.grantsTrafficMb * 1024 * 1024)} traffic`)
  if (addon.grantsTeamMembers)
    parts.push(
      `+${addon.grantsTeamMembers} seat${addon.grantsTeamMembers > 1 ? 's' : ''}`
    )
  if (addon.grantsFeature)
    parts.push(
      `unlocks ${GRANT_FEATURES.find((f) => f.value === addon.grantsFeature)?.label ?? addon.grantsFeature}`
    )
  return parts.length > 0 ? parts.join(' · ') : 'grants nothing yet'
}

function AddonForm({
  addon,
  plans,
  onDone,
}: {
  addon: AddonListItem | null
  plans: { id: string; name: string }[]
  onDone: () => void
}) {
  const [state, action, pending] = useActionState<AddonFormState, FormData>(
    saveAddonAction.bind(null, addon?.id ?? null),
    undefined
  )
  const [allPlans, setAllPlans] = useState(addon?.availableOnAllPlans ?? true)
  const currency = addon?.currencyCode ?? 'BDT'
  const errors = state?.fieldErrors ?? {}

  // The action returns `saved` instead of redirecting, so the panel closes itself
  // and leaves the revalidated list behind. In an effect, not inline: calling the
  // parent's setState during render is the "cannot update a component while
  // rendering a different component" error.
  useEffect(() => {
    if (state?.saved) onDone()
  }, [state?.saved, onDone])

  return (
    <Card>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {addon ? `Edit ${addon.name}` : 'New add-on'}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onDone}
                title="Close"
              >
                <X />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  defaultValue={addon?.name ?? ''}
                  required
                />
                {errors.name && <FieldError>{errors.name}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="code">Code</FieldLabel>
                <Input
                  id="code"
                  name="code"
                  defaultValue={addon?.code ?? ''}
                  placeholder="EXTRA_STORAGE_5GB"
                  className="font-mono"
                  required
                />
                {errors.code && <FieldError>{errors.code}</FieldError>}
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={addon?.description ?? ''}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-4">
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
                    addon?.monthlyPriceCents ?? 0,
                    currency
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="annualPrice">Annual</FieldLabel>
                <MoneyInput
                  id="annualPrice"
                  name="annualPrice"
                  currencyCode={currency}
                  defaultValue={centsToMajorString(
                    addon?.annualPriceCents ?? null,
                    currency
                  )}
                />
                <FieldDescription>Empty = 12× monthly.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="position">Sort order</FieldLabel>
                <Input
                  id="position"
                  name="position"
                  inputMode="numeric"
                  defaultValue={String(addon?.position ?? 0)}
                />
              </Field>
            </div>

            <p className="text-muted-foreground text-xs font-medium">
              What one unit grants, on top of the plan
            </p>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="grantsCustomDomains">Domains</FieldLabel>
                <Input
                  id="grantsCustomDomains"
                  name="grantsCustomDomains"
                  inputMode="numeric"
                  defaultValue={String(addon?.grantsCustomDomains ?? 0)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="grantsStorageMb">Storage (MB)</FieldLabel>
                <Input
                  id="grantsStorageMb"
                  name="grantsStorageMb"
                  inputMode="numeric"
                  defaultValue={String(addon?.grantsStorageMb ?? 0)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="grantsTrafficMb">Traffic (MB)</FieldLabel>
                <Input
                  id="grantsTrafficMb"
                  name="grantsTrafficMb"
                  inputMode="numeric"
                  defaultValue={String(addon?.grantsTrafficMb ?? 0)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="grantsTeamMembers">Seats</FieldLabel>
                <Input
                  id="grantsTeamMembers"
                  name="grantsTeamMembers"
                  inputMode="numeric"
                  defaultValue={String(addon?.grantsTeamMembers ?? 0)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="grantsFeature">Unlocks feature</FieldLabel>
                <FormSelect
                  id="grantsFeature"
                  name="grantsFeature"
                  defaultValue={addon?.grantsFeature ?? ''}
                >
                  {GRANT_FEATURES.map((feature) => (
                    <option key={feature.value} value={feature.value}>
                      {feature.label}
                    </option>
                  ))}
                </FormSelect>
                <FieldDescription>
                  Only takes effect on plans that mark the feature “Optional
                  add-on”.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="maxQuantity">Max quantity</FieldLabel>
                <Input
                  id="maxQuantity"
                  name="maxQuantity"
                  inputMode="numeric"
                  defaultValue={
                    addon?.maxQuantity === null || addon === null
                      ? ''
                      : String(addon.maxQuantity)
                  }
                  placeholder="Unlimited"
                />
                <FieldDescription>
                  Empty = stackable. Use 1 for a switch.
                </FieldDescription>
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={addon?.isActive ?? true}
                className="mt-0.5 size-4"
              />
              Active — sellable at checkout
            </label>

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="availableOnAllPlans"
                checked={allPlans}
                onChange={(event) => setAllPlans(event.target.checked)}
                className="mt-0.5 size-4"
              />
              Available on every plan
            </label>

            {!allPlans && (
              <Field>
                <FieldLabel>Available on</FieldLabel>
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
                          addon?.planIds.includes(plan.id) ?? false
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

            {state?.error && <FieldError>{state.error}</FieldError>}

            <div className="flex gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : addon ? 'Save add-on' : 'Create add-on'}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

export function AddonsClient({
  addons,
  plans,
}: {
  addons: AddonListItem[]
  plans: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const editingAddon =
    editing && editing !== 'new'
      ? (addons.find((addon) => addon.id === editing) ?? null)
      : null

  return (
    <div className="flex flex-col gap-6">
      {editing === null ? (
        <div>
          <Button onClick={() => setEditing('new')}>
            <Plus />
            New add-on
          </Button>
        </div>
      ) : (
        <AddonForm
          addon={editingAddon}
          plans={plans}
          onDone={() => setEditing(null)}
        />
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {addons.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No add-ons"
          description="Add-ons let a tenant raise one limit without moving up a whole tier."
        />
      ) : (
        <ListPanel>
          {addons.map((addon) => (
            <ListRow key={addon.id}>
              <ListRowText
                title={
                  <button
                    type="button"
                    onClick={() => setEditing(addon.id)}
                    className="text-left hover:underline"
                  >
                    {addon.name}
                  </button>
                }
                meta={
                  <>
                    <span className="font-mono">{addon.code}</span> ·{' '}
                    {grantSummary(addon)}
                    {addon.subscriberCount > 0 &&
                      ` · ${addon.subscriberCount} subscribed`}
                  </>
                }
                badges={
                  <>
                    {!addon.isActive && (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                    {!addon.availableOnAllPlans && (
                      <Badge variant="secondary">
                        {addon.planIds.length} plan
                        {addon.planIds.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {addon.maxQuantity === 1 && (
                      <Badge variant="outline">Switch</Badge>
                    )}
                  </>
                }
              />
              <ListRowActions>
                <Money>
                  {formatMoney(addon.monthlyPriceCents, addon.currencyCode)}/mo
                </Money>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  title="Delete add-on"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm(`Delete ${addon.name}?`)) return
                    startTransition(async () => {
                      const result = await deleteAddonAction(addon.id)
                      setError(result.error ?? null)
                    })
                  }}
                >
                  <Trash2 />
                </Button>
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
