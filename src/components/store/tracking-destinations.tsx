'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  Lock,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import {
  saveStoreTrackingAction,
  sendTrackingTestEventAction,
  type TrackingTestState,
} from '@/app/(dashboard)/tracking/actions'
import { UNCHANGED_SECRET } from '@/lib/validation/integration'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field'

/**
 * Which destinations this workspace's plan actually allows.
 *
 * Each tag is a separate line on the price sheet, and `updateStoreIntegration`
 * refuses one that is not on the plan. Read here as well so the refusal arrives
 * before the merchant fills the form rather than after — a locked field that
 * looks editable is a save they lose.
 */
export interface TrackingFeatureAccess {
  planName: string
  metaPixel: boolean
  googleAnalytics: boolean
  googleTagManager: boolean
}

export interface StoreTrackingSetupRow {
  storeId: string
  name: string
  subdomain: string
  gaMeasurementId: string | null
  gtmContainerId: string | null
  metaPixelId: string | null
  metaTestEventCode: string | null
  customHeadScript: string | null
  hasMetaAccessToken: boolean
  hasGa4ApiSecret: boolean
  updatedAt: string | null
  recent: { total: number; succeeded: number; failed: number; pending: number }
}

/**
 * Every store's tracking, on one screen.
 *
 * A workspace sells the same catalogue through several landing pages, and they
 * usually report to one ad account — so the question a merchant actually has is
 * "are all of my pages still reporting", which no per-store settings page can
 * answer. Each card carries its credentials *and* the last 24 hours of
 * deliveries, because a pixel whose token was revoked looks identical to a
 * working one until you see that nothing has arrived from it.
 *
 * Collapsed by default, and open when there is only one store to look at.
 */
export function TrackingDestinations({
  stores,
  features,
}: {
  stores: StoreTrackingSetupRow[]
  features: TrackingFeatureAccess
}) {
  if (stores.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          No stores yet. Create one under Stores, then point it at Meta and
          Google here.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {stores.map((store) => (
        <StoreTrackingCard
          key={store.storeId}
          store={store}
          features={features}
          defaultOpen={stores.length === 1}
        />
      ))}
    </div>
  )
}

/** What the header says about a store before you open it. */
function statusOf(store: StoreTrackingSetupRow): {
  tone: 'live' | 'browser' | 'failing' | 'off'
  label: string
} {
  const serverSide =
    (store.metaPixelId && store.hasMetaAccessToken) ||
    (store.gaMeasurementId && store.hasGa4ApiSecret)

  if (store.recent.failed > 0) {
    return { tone: 'failing', label: `${store.recent.failed} failing` }
  }
  if (serverSide) return { tone: 'live', label: 'Server-side on' }
  if (store.metaPixelId || store.gaMeasurementId || store.gtmContainerId) {
    return { tone: 'browser', label: 'Browser tags only' }
  }
  return { tone: 'off', label: 'Not set up' }
}

const TONE_CLASS = {
  live: 'text-lime-500',
  browser: 'text-muted-foreground',
  failing: 'text-destructive',
  off: 'text-muted-foreground/50',
} as const

function StoreTrackingCard({
  store,
  features,
  defaultOpen,
}: {
  store: StoreTrackingSetupRow
  features: TrackingFeatureAccess
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const status = statusOf(store)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 text-left"
        >
          <Circle
            className={`size-2.5 shrink-0 fill-current ${TONE_CLASS[status.tone]}`}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="truncate font-medium">{store.name}</span>
            <Badge
              variant={
                status.tone === 'failing'
                  ? 'destructive'
                  : status.tone === 'live'
                    ? 'lime'
                    : 'outline'
              }
            >
              {status.label}
            </Badge>
            {store.metaPixelId && <Badge variant="outline">Meta pixel</Badge>}
            {store.hasMetaAccessToken && (
              <Badge variant="secondary">Meta CAPI</Badge>
            )}
            {store.gaMeasurementId && <Badge variant="outline">GA4</Badge>}
            {store.hasGa4ApiSecret && (
              <Badge variant="secondary">GA4 server</Badge>
            )}
            {store.gtmContainerId && <Badge variant="outline">GTM</Badge>}
          </div>

          <span className="text-muted-foreground shrink-0 text-xs">
            {store.recent.total > 0
              ? `${store.recent.succeeded}/${store.recent.total} in 24h`
              : 'nothing in 24h'}
          </span>
          <ChevronDown
            className={`text-muted-foreground size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Failures are shown whether or not the card is open. A closed card
            that hides the one thing wrong with it is how a broken pixel
            survives a merchant scrolling past it every morning. */}
        {!open && store.recent.failed > 0 && (
          <p className="text-destructive flex items-center gap-2 pl-6 text-sm">
            <TriangleAlert className="size-4 shrink-0" />
            {store.recent.failed}{' '}
            {store.recent.failed === 1 ? 'event' : 'events'} rejected in the
            last 24 hours — open the log below for the reason.
          </p>
        )}

        {open && <StoreTrackingForm store={store} features={features} />}
      </CardContent>
    </Card>
  )
}

/**
 * Setting a store up is two pastes per platform: the id, and the credential
 * that lets this server report on the merchant's behalf. Everything else —
 * which events to send, how they are deduplicated against the browser tag, when
 * to retry — is decided by the platform rather than asked about, because a
 * merchant configuring an ad pixel has no way to answer those questions and no
 * reason to be asked them.
 */
function StoreTrackingForm({
  store,
  features,
}: {
  store: StoreTrackingSetupRow
  features: TrackingFeatureAccess
}) {
  const boundAction = saveStoreTrackingAction.bind(null, store.storeId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  const [test, setTest] = useState<TrackingTestState>(undefined)
  const [testing, startTest] = useTransition()

  // Controlled rather than uncontrolled: React resets a form's fields once its
  // action returns, so a save refused by the plan gate would empty every box
  // the merchant had just filled and make them type it all again.
  const [fields, setFields] = useState({
    metaPixelId: store.metaPixelId ?? '',
    metaTestEventCode: store.metaTestEventCode ?? '',
    gaMeasurementId: store.gaMeasurementId ?? '',
    gtmContainerId: store.gtmContainerId ?? '',
    customHeadScript: store.customHeadScript ?? '',
  })

  const set = (field: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [field]: value }))

  const id = (field: string) => `${store.storeId}-${field}`

  return (
    <div className="flex flex-col gap-6 border-t pt-5">
      <form action={action}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">Meta</FieldLegend>
            <FieldDescription>
              The pixel renders on every published page in this store. Add the
              access token as well and the same events are reported from this
              server too, sharing one event ID so Meta counts them once.
            </FieldDescription>

            {!features.metaPixel && (
              <Locked feature="Meta Pixel" plan={features.planName} />
            )}

            <Field>
              <FieldLabel htmlFor={id('metaPixelId')}>Pixel ID</FieldLabel>
              <Input
                id={id('metaPixelId')}
                name="metaPixelId"
                value={fields.metaPixelId}
                onChange={(event) => set('metaPixelId')(event.target.value)}
                disabled={!features.metaPixel}
                placeholder="123456789012345"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={id('metaAccessToken')}>
                Conversions API access token
              </FieldLabel>
              <SecretInput
                id={id('metaAccessToken')}
                name="metaAccessToken"
                configured={store.hasMetaAccessToken}
                disabled={!features.metaPixel}
                placeholder="EAAG…"
              />
              <FieldDescription>
                Events Manager → your pixel → Settings → Conversions API →
                Generate access token. Needs the pixel ID above.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={id('metaTestEventCode')}>
                Test event code (optional)
              </FieldLabel>
              <Input
                id={id('metaTestEventCode')}
                name="metaTestEventCode"
                value={fields.metaTestEventCode}
                onChange={(event) =>
                  set('metaTestEventCode')(event.target.value)
                }
                disabled={!features.metaPixel}
                placeholder="TEST12345"
              />
              <FieldDescription>
                Routes events to the Test Events tab while you verify the setup.
                Clear it afterwards — events sent with a test code are kept out
                of reporting and out of ad optimisation.
              </FieldDescription>
            </Field>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend variant="label">Google</FieldLegend>
            <FieldDescription>
              With an API secret saved, purchases are reported from this server
              and the browser tag stops sending its own — GA4 has no
              deduplication, so one copy is the only safe number.
            </FieldDescription>

            {!features.googleAnalytics && (
              <Locked feature="Google Analytics" plan={features.planName} />
            )}

            <Field>
              <FieldLabel htmlFor={id('gaMeasurementId')}>
                GA4 measurement ID
              </FieldLabel>
              <Input
                id={id('gaMeasurementId')}
                name="gaMeasurementId"
                value={fields.gaMeasurementId}
                onChange={(event) => set('gaMeasurementId')(event.target.value)}
                disabled={!features.googleAnalytics}
                placeholder="G-XXXXXXXXXX"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={id('ga4ApiSecret')}>
                Measurement Protocol API secret
              </FieldLabel>
              <SecretInput
                id={id('ga4ApiSecret')}
                name="ga4ApiSecret"
                configured={store.hasGa4ApiSecret}
                disabled={!features.googleAnalytics}
                placeholder="Admin → Data streams → Measurement Protocol API secrets"
              />
              <FieldDescription>
                Needs the measurement ID above.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={id('gtmContainerId')}>
                Tag Manager container ID
              </FieldLabel>
              <Input
                id={id('gtmContainerId')}
                name="gtmContainerId"
                value={fields.gtmContainerId}
                onChange={(event) => set('gtmContainerId')(event.target.value)}
                disabled={!features.googleTagManager}
                placeholder="GTM-XXXXXXX"
              />
              {!features.googleTagManager && (
                <Locked feature="Tag Manager" plan={features.planName} />
              )}
            </Field>
          </FieldSet>

          <FieldSeparator />

          <Field>
            <FieldLabel htmlFor={id('customHeadScript')}>
              Custom head script
            </FieldLabel>
            <Textarea
              id={id('customHeadScript')}
              name="customHeadScript"
              value={fields.customHeadScript}
              onChange={(event) => set('customHeadScript')(event.target.value)}
              disabled={!features.googleTagManager}
              rows={4}
              className="font-mono text-xs"
            />
            <FieldDescription>
              Injected into the &lt;head&gt; of this store&rsquo;s published
              pages only — never the dashboard. Use with caution.
            </FieldDescription>
          </Field>

          {state?.error && <FieldError>{state.error}</FieldError>}

          <Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
              {state?.success && !state.error && (
                <span className="text-muted-foreground text-sm">
                  {state.success}
                </span>
              )}
              {store.updatedAt && (
                <span className="text-muted-foreground text-xs">
                  last changed {new Date(store.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </Field>
        </FieldGroup>
      </form>

      {/* Outside the form on purpose: this posts a real event to Meta and
          Google and must not ride along with a save, nor submit one. */}
      <div className="flex flex-col gap-3 border-t pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={
              testing || (!store.hasMetaAccessToken && !store.hasGa4ApiSecret)
            }
            onClick={() =>
              startTest(async () => {
                setTest(await sendTrackingTestEventAction(store.storeId))
              })
            }
          >
            {testing && <Loader2 className="size-4 animate-spin" />}
            {testing ? 'Sending…' : 'Send test event'}
          </Button>
          <p className="text-muted-foreground text-sm text-pretty">
            Meta checks the token and reports a bad one straight away. Google
            only checks the event itself, so its result tells you where to
            confirm the rest.
          </p>
        </div>

        {test && 'error' in test && (
          <p className="text-destructive text-sm">{test.error}</p>
        )}

        {test && 'results' in test && (
          <ul className="flex flex-col gap-2">
            {test.results.map((result) => (
              <li
                key={result.destination}
                className="flex items-start gap-2 text-sm"
              >
                {result.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-lime-500" />
                ) : (
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                )}
                <span>
                  <span className="font-medium">
                    {result.destination === 'meta' ? 'Meta' : 'Google'}
                  </span>{' '}
                  — {result.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * What a plan does not include, said before the merchant types into it.
 *
 * The alternative — and what happened until this existed — is a full form, a
 * Save, and an error explaining that none of it was allowed.
 */
function Locked({ feature, plan }: { feature: string; plan: string }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
      <Lock className="size-3.5 shrink-0" />
      {feature} is not included in {plan}.
      <Link href="/billing" className="underline underline-offset-4">
        See plans
      </Link>
    </p>
  )
}

/**
 * A credential input that never renders the credential.
 *
 * A saved token is never sent back to the browser — only whether one exists.
 * What this submits in its place is a sentinel meaning "leave it alone", so
 * saving an unrelated field cannot wipe the token that makes it work.
 *
 * Replacing and removing are separate, explicit actions rather than "clear the
 * box and save". An access token that could be destroyed by clicking into a
 * field and clicking out again is one merchants would lose by accident, and
 * losing it silently turns server-side tracking off without turning anything
 * red.
 */
function SecretInput({
  id,
  name,
  configured,
  disabled,
  placeholder,
}: {
  id: string
  name: string
  configured: boolean
  /** Locked by the plan. A saved credential can still be removed. */
  disabled?: boolean
  placeholder: string
}) {
  const [mode, setMode] = useState<'keep' | 'replace' | 'remove'>('keep')

  if (!configured || mode === 'replace') {
    return (
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="hidden"
        name={name}
        value={mode === 'remove' ? '' : UNCHANGED_SECRET}
      />
      <span className="text-muted-foreground text-sm">
        {mode === 'remove'
          ? 'Will be removed when you save.'
          : '•••••••• saved'}
      </span>
      {mode === 'remove' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMode('keep')}
        >
          Keep it
        </Button>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode('replace')}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode('remove')}
          >
            Remove
          </Button>
        </>
      )}
    </div>
  )
}
