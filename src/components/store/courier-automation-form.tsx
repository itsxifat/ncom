'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  saveCourierAutomationAction,
  type CourierActionState,
} from '@/app/(dashboard)/courier-actions'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

export interface CourierAutomationValues {
  autoDispatchEnabled: boolean
  fraudCheckEnabled: boolean
  minDeliveryRatePercent: number
  minTotalParcels: number
  minDeliveredOrders: number
  maxFraudReports: number
  maxCancelledOrders: number | null
  allowUnknownCustomers: boolean
  manualReviewAbove: number | null
  dispatchDelayMinutes: number
  requirePaidOrders: boolean
  fraudCacheHours: number
  autoCancelOnFail: boolean
  currencyCode: string
}

/**
 * The rules that decide whether an order ships without a human.
 *
 * Laid out in the order the decision is actually made — screen, then judge,
 * then dispatch — rather than grouped by input type, so reading the form top to
 * bottom describes what will happen to the next order that arrives.
 *
 * The live summary sentence exists because these five numbers interact in ways
 * that are genuinely hard to hold in your head: a 90% threshold with a minimum
 * of 1 delivery behaves nothing like 90% with a minimum of 10, and a merchant
 * should not have to place a test order to find that out.
 */
export function CourierAutomationForm({
  values,
  screeningReady,
}: {
  values: CourierAutomationValues
  /** False when no portal account is stored, so nothing can be screened. */
  screeningReady: boolean
}) {
  const [state, action, pending] = useActionState<CourierActionState, FormData>(
    saveCourierAutomationAction,
    undefined
  )

  const [rate, setRate] = useState(values.minDeliveryRatePercent)
  const [minTotal, setMinTotal] = useState(values.minTotalParcels)
  const [minDelivered, setMinDelivered] = useState(values.minDeliveredOrders)
  const [autoDispatch, setAutoDispatch] = useState(values.autoDispatchEnabled)
  const [allowUnknown, setAllowUnknown] = useState(values.allowUnknownCustomers)

  return (
    <form action={action}>
      <FieldGroup>
        {!screeningReady && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            No portal accounts yet — add one under Fraud screening accounts
            above. Until then orders are not screened at all.
          </p>
        )}

        <label className="flex items-start gap-3 text-sm">
          <Switch
            name="fraudCheckEnabled"
            defaultChecked={values.fraudCheckEnabled}
          />
          <span>
            <span className="font-medium">Screen customers</span>
            <span className="text-muted-foreground block">
              Look up each order&rsquo;s phone number against the
              courier&rsquo;s delivery history.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <Switch
            name="autoDispatchEnabled"
            defaultChecked={values.autoDispatchEnabled}
            onCheckedChange={(checked) => setAutoDispatch(Boolean(checked))}
          />
          <span>
            <span className="font-medium">
              Send passing orders to the courier automatically
            </span>
            <span className="text-muted-foreground block">
              Off means every order waits for you, however clean the customer.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="minTotalParcels">
              Minimum parcels in history
            </FieldLabel>
            <Input
              id="minTotalParcels"
              name="minTotalParcels"
              type="number"
              min={0}
              max={1000}
              value={minTotal}
              onChange={(event) => setMinTotal(Number(event.target.value))}
            />
            <FieldDescription>
              How much the courier knows about this number at all, delivered or
              refused. Below this they are simply unknown, not bad.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="minDeliveredOrders">
              Minimum successful deliveries
            </FieldLabel>
            <Input
              id="minDeliveredOrders"
              name="minDeliveredOrders"
              type="number"
              min={0}
              max={1000}
              value={minDelivered}
              onChange={(event) => setMinDelivered(Number(event.target.value))}
            />
            <FieldDescription>
              How many of those parcels actually arrived. 20 parcels with 2
              delivered is plenty of history and a bad customer.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="minDeliveryRatePercent">
              Minimum delivery rate
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="minDeliveryRatePercent"
                name="minDeliveryRatePercent"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
              />
              <span className="text-muted-foreground text-sm">%</span>
            </div>
            <FieldDescription>
              Delivered as a share of every parcel. Set 0 to judge on the two
              counts alone, which is where most stores start.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="maxFraudReports">
              Fraud reports allowed
            </FieldLabel>
            <Input
              id="maxFraudReports"
              name="maxFraudReports"
              type="number"
              min={0}
              max={1000}
              defaultValue={values.maxFraudReports}
            />
            <FieldDescription>
              Above this the order fails outright rather than going to review.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="maxCancelledOrders">
              Refused parcels allowed
            </FieldLabel>
            <Input
              id="maxCancelledOrders"
              name="maxCancelledOrders"
              type="number"
              min={0}
              max={10000}
              defaultValue={values.maxCancelledOrders ?? ''}
              placeholder="No limit"
            />
            <FieldDescription>
              An absolute ceiling on top of the rate. Leave empty to ignore it.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="manualReviewAbove">
              Always review orders above
            </FieldLabel>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {values.currencyCode}
              </span>
              <Input
                id="manualReviewAbove"
                name="manualReviewAbove"
                type="number"
                min={0}
                step="0.01"
                defaultValue={values.manualReviewAbove ?? ''}
                placeholder="No limit"
              />
            </div>
            <FieldDescription>
              A spotless customer ordering far above your usual basket is worth
              a look. Leave empty to ignore value.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="dispatchDelayMinutes">
              Hold before dispatch
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="dispatchDelayMinutes"
                name="dispatchDelayMinutes"
                type="number"
                min={0}
                max={10080}
                defaultValue={values.dispatchDelayMinutes}
              />
              <span className="text-muted-foreground text-sm">minutes</span>
            </div>
            <FieldDescription>
              A window for the customer to call and change or cancel before a
              parcel physically exists.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="fraudCacheHours">
              Re-check a number after
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="fraudCacheHours"
                name="fraudCacheHours"
                type="number"
                min={1}
                max={720}
                defaultValue={values.fraudCacheHours}
              />
              <span className="text-muted-foreground text-sm">hours</span>
            </div>
            <FieldDescription>
              Each lookup is a login to the courier portal, and these numbers
              move over weeks, not minutes.
            </FieldDescription>
          </Field>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <Switch
            name="allowUnknownCustomers"
            defaultChecked={values.allowUnknownCustomers}
            onCheckedChange={(checked) => setAllowUnknown(Boolean(checked))}
          />
          <span>
            <span className="font-medium">Trust first-time customers</span>
            <span className="text-muted-foreground block">
              Most numbers with no history are simply new. Turn this off to
              review them by hand.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <Switch
            name="requirePaidOrders"
            defaultChecked={values.requirePaidOrders}
          />
          <span>
            <span className="font-medium">Only auto-send paid orders</span>
            <span className="text-muted-foreground block">
              Leave off for cash on delivery, which is unpaid by definition.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <Switch
            name="autoCancelOnFail"
            defaultChecked={values.autoCancelOnFail}
          />
          <span>
            <span className="font-medium">
              Cancel orders that fail outright
            </span>
            <span className="text-muted-foreground block">
              Otherwise they queue for review. A wrong auto-cancel loses a real
              sale, so watch a few first.
            </span>
          </span>
        </label>

        <Summary
          autoDispatch={autoDispatch}
          rate={rate}
          minTotal={minTotal}
          minDelivered={minDelivered}
          allowUnknown={allowUnknown}
        />

        {state?.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-sm text-emerald-600">{state.success}</p>
        )}

        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save rules
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

/** Restates the current settings as the sentence they actually mean. */
function Summary({
  autoDispatch,
  rate,
  minTotal,
  minDelivered,
  allowUnknown,
}: {
  autoDispatch: boolean
  rate: number
  minTotal: number
  minDelivered: number
  allowUnknown: boolean
}) {
  return (
    <p className="bg-muted/40 rounded-lg border p-3 text-sm text-pretty">
      {autoDispatch ? (
        <>
          An order goes straight to the courier when the customer has at least{' '}
          <strong>{minTotal}</strong> parcel{minTotal === 1 ? '' : 's'} on
          record, of which at least <strong>{minDelivered}</strong> were
          delivered
          {rate > 0 ? (
            <>
              , at a rate of <strong>{rate}%</strong> or better
            </>
          ) : null}
          {allowUnknown ? ', or no courier history at all' : ''}. Everything
          else waits in <strong>Needs review</strong> for you or a moderator to
          release or refuse.
        </>
      ) : (
        <>
          Every order is screened and shown a verdict, but nothing is sent to a
          courier until you dispatch it yourself. Turn on automatic dispatch
          above once you trust the thresholds.
        </>
      )}
    </p>
  )
}
