'use client'

import { useActionState, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import {
  sendTrackingTestEventAction,
  updateStoreIntegrationAction,
  type TrackingTestState,
} from '@/app/(dashboard)/stores/actions'
import { UNCHANGED_SECRET } from '@/lib/validation/integration'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

/**
 * Setting up tracking is two pastes per platform: the id, and the credential
 * that lets this server report on the merchant's behalf. Everything else —
 * which events to send, how they are deduplicated against the browser tag, when
 * to retry — is decided by the platform rather than asked about, because a
 * merchant configuring an ad pixel has no way to answer those questions and no
 * reason to be asked them.
 */
export function IntegrationForm({
  storeId,
  gaMeasurementId,
  gtmContainerId,
  metaPixelId,
  customHeadScript,
  metaTestEventCode,
  hasMetaAccessToken,
  hasGa4ApiSecret,
}: {
  storeId: string
  gaMeasurementId: string | null
  gtmContainerId: string | null
  metaPixelId: string | null
  customHeadScript: string | null
  metaTestEventCode: string | null
  hasMetaAccessToken: boolean
  hasGa4ApiSecret: boolean
}) {
  const boundAction = updateStoreIntegrationAction.bind(null, storeId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  const [test, setTest] = useState<TrackingTestState>(undefined)
  const [testing, startTest] = useTransition()

  return (
    <div className="space-y-6">
      <form action={action}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gaMeasurementId">
              Google Analytics measurement ID
            </FieldLabel>
            <Input
              id="gaMeasurementId"
              name="gaMeasurementId"
              defaultValue={gaMeasurementId ?? ''}
              placeholder="G-XXXXXXXXXX"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gtmContainerId">
              Google Tag Manager container ID
            </FieldLabel>
            <Input
              id="gtmContainerId"
              name="gtmContainerId"
              defaultValue={gtmContainerId ?? ''}
              placeholder="GTM-XXXXXXX"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="metaPixelId">Meta Pixel ID</FieldLabel>
            <Input
              id="metaPixelId"
              name="metaPixelId"
              defaultValue={metaPixelId ?? ''}
              placeholder="123456789012345"
            />
          </Field>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend variant="label">Server-side tracking</FieldLegend>
            <FieldDescription>
              Report sales from this server as well as from the browser, so
              conversions still reach Meta and Google when a shopper&rsquo;s ad
              blocker stops the tags from loading. Nothing is counted twice:
              Meta receives one shared event ID for both copies, and purchases
              are only ever sent to Google from here.
            </FieldDescription>

            <Field>
              <FieldLabel htmlFor="metaAccessToken">
                Meta Conversions API access token
              </FieldLabel>
              <SecretInput
                id="metaAccessToken"
                name="metaAccessToken"
                configured={hasMetaAccessToken}
                placeholder="EAAG…"
              />
              <FieldDescription>
                Events Manager → your pixel → Settings → Conversions API →
                Generate access token. Needs the Meta Pixel ID above.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="metaTestEventCode">
                Meta test event code (optional)
              </FieldLabel>
              <Input
                id="metaTestEventCode"
                name="metaTestEventCode"
                defaultValue={metaTestEventCode ?? ''}
                placeholder="TEST12345"
              />
              <FieldDescription>
                Routes events to the Test Events tab while you verify the setup.
                Clear it afterwards — events sent with a test code are kept out
                of reporting and out of ad optimisation.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="ga4ApiSecret">
                GA4 Measurement Protocol API secret
              </FieldLabel>
              <SecretInput
                id="ga4ApiSecret"
                name="ga4ApiSecret"
                configured={hasGa4ApiSecret}
                placeholder="Admin → Data streams → Measurement Protocol API secrets"
              />
              <FieldDescription>
                Needs the measurement ID above. While this is set, the browser
                tag stops sending its own page views so that nothing arrives in
                Google twice.
              </FieldDescription>
            </Field>
          </FieldSet>

          <FieldSeparator />

          <Field>
            <FieldLabel htmlFor="customHeadScript">
              Custom head script
            </FieldLabel>
            <Textarea
              id="customHeadScript"
              name="customHeadScript"
              defaultValue={customHeadScript ?? ''}
              rows={4}
              className="font-mono text-xs"
            />
            <FieldDescription>
              Injected into the &lt;head&gt; of your published site only — never
              the dashboard. Use with caution.
            </FieldDescription>
          </Field>

          {state?.error && <FieldError>{state.error}</FieldError>}
          <Field>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save integrations'}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      {/* Outside the form on purpose: this posts a real event to Meta and
          Google and must not ride along with a save, nor submit one. */}
      <div className="space-y-3 border-t pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={testing || (!hasMetaAccessToken && !hasGa4ApiSecret)}
            onClick={() =>
              startTest(async () => {
                setTest(await sendTrackingTestEventAction(storeId))
              })
            }
          >
            {testing && <Loader2 className="size-4 animate-spin" />}
            {testing ? 'Sending…' : 'Send test event'}
          </Button>
          <p className="text-muted-foreground text-sm">
            Meta checks the token and reports a bad one straight away. Google
            only checks the event itself, so its result tells you where to
            confirm the rest.
          </p>
        </div>

        {test && 'error' in test && (
          <p className="text-destructive text-sm">{test.error}</p>
        )}

        {test && 'results' in test && (
          <ul className="space-y-2">
            {test.results.map((result) => (
              <li
                key={result.destination}
                className="flex items-start gap-2 text-sm"
              >
                {result.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
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
 * A credential input that never renders the credential.
 *
 * A saved token is never sent back to the browser — see `getStoreIntegration`,
 * which reports only whether one exists. What this submits in its place is a
 * sentinel meaning "leave it alone", so saving an unrelated field cannot wipe
 * the token that makes it work.
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
  placeholder,
}: {
  id: string
  name: string
  configured: boolean
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
