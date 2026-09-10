'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react'
import {
  rotateOrderSecretAction,
  saveOrderDestinationAction,
  setOrderRoutingAction,
  setPurchaseReportingAction,
  testOrderDestinationAction,
  type DestinationResult,
} from '@/app/(dashboard)/settings/order-destination/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { cn } from '@/lib/utils'

export interface OrderDestinationView {
  mode: 'NCOM' | 'OWN_WEBSITE'
  purchaseReporting: 'NCOM' | 'OWN_WEBSITE'
  endpointUrl: string | null
  keyId: string | null
  secretHint: string | null
  timeoutMs: number
  lastCheckedAt: string | null
  lastOkAt: string | null
  lastError: string | null
}

/**
 * Where orders are processed.
 *
 * Built as a choice between two whole ways of working rather than as a toggle
 * with a URL under it, because that is what it is. A merchant reading this
 * screen is deciding whether their staff open NCOM every morning or their own
 * admin, and the consequences — no fraud screen here, no courier here, no
 * status to update here — belong on the card they are choosing, not in a
 * footnote underneath it.
 *
 * The switch to the merchant's website is refused until the endpoint has
 * answered a test at least once. That guard lives in the service too; it is
 * repeated here so the button explains itself before it is pressed rather than
 * after.
 */
export function OrderDestinationManager({
  status,
  hasCatalogConnection,
}: {
  status: OrderDestinationView
  hasCatalogConnection: boolean
}) {
  const [endpointUrl, setEndpointUrl] = useState(status.endpointUrl ?? '')
  const [result, setResult] = useState<DestinationResult | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<DestinationResult>) {
    setResult(null)
    startTransition(async () => setResult(await action()))
  }

  const forwarding = status.mode === 'OWN_WEBSITE'
  const proven = Boolean(status.lastOkAt)
  const siteReportsPurchase = status.purchaseReporting === 'OWN_WEBSITE'

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Choice
          selected={!forwarding}
          title="Process orders in NCOM"
          summary="Orders land on the Orders screen here."
          points={[
            'Courier fraud screening on every phone number',
            'Automatic dispatch to Steadfast or Pathao',
            'Status, returns, refunds and packing labels here',
          ]}
          action={
            forwarding && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => setOrderRoutingAction('NCOM'))}
              >
                Process orders here
              </Button>
            )
          }
        />

        <Choice
          selected={forwarding}
          title="Process orders on my own website"
          summary="Each order is handed to your site the moment it is placed, as a pending order."
          points={[
            'Your site takes the stock, screens and ships it',
            'NCOM keeps a copy as a receipt and does nothing else',
            'Undelivered orders are retried for hours, and shown here until they land',
          ]}
          action={
            !forwarding && (
              <Button
                size="sm"
                disabled={pending || !proven}
                title={
                  proven
                    ? undefined
                    : 'Test the endpoint first — orders will not be switched to an address that has never answered'
                }
                onClick={() => run(() => setOrderRoutingAction('OWN_WEBSITE'))}
              >
                <Send />
                Send orders to my website
              </Button>
            )
          }
        />
      </div>

      {result?.error && (
        <p className="text-destructive flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {result.error}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="endpointUrl">Order endpoint</FieldLabel>
            <Input
              id="endpointUrl"
              value={endpointUrl}
              placeholder="https://yourshop.com/api/ncom/orders"
              onChange={(event) => setEndpointUrl(event.target.value)}
            />
            <FieldDescription>
              The exact address we POST each order to — not a base URL we append
              a path to. We sign every request the same way we sign catalogue
              reads and webhooks, so if you already verify one of those you
              already have the code.{' '}
              <Link href="/docs#order-destination" className="underline">
                The contract, and what we send
              </Link>
              .
            </FieldDescription>
            {result?.error && <FieldError>{result.error}</FieldError>}
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || endpointUrl.trim().length === 0}
              onClick={() => run(() => saveOrderDestinationAction(endpointUrl))}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              Save and send a test order
            </Button>

            {status.endpointUrl && (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(testOrderDestinationAction)}
                >
                  <RefreshCw />
                  Send a test order
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(rotateOrderSecretAction)}
                >
                  Rotate secret
                </Button>
              </>
            )}
          </div>

          {result?.check && (
            <p
              className={
                result.check.ok
                  ? 'text-sm text-emerald-600'
                  : 'text-destructive text-sm'
              }
            >
              {result.check.ok ? '✓ ' : '✕ '}
              {result.check.message}
            </p>
          )}
        </CardContent>
      </Card>

      {result?.secret && (
        <Secret keyId={result.keyId ?? ''} secret={result.secret} />
      )}

      {status.endpointUrl && (
        <Card>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Endpoint</span>
              {proven ? (
                <Badge variant="outline" className="text-emerald-600">
                  Accepting orders
                </Badge>
              ) : (
                <Badge variant="destructive">Never answered</Badge>
              )}
              {forwarding && <Badge>Live — orders go here</Badge>}
            </div>

            {status.lastError && (
              <p className="text-destructive flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {status.lastError}
              </p>
            )}

            <dl className="grid gap-2 sm:grid-cols-2">
              <Row label="Address" value={status.endpointUrl} />
              <Row label="Key id" value={status.keyId ?? '—'} />
              <Row label="Signing secret" value={status.secretHint ?? '—'} />
              <Row label="Timeout" value={`${status.timeoutMs}ms`} />
              <Row
                label="Last checked"
                value={
                  status.lastCheckedAt
                    ? new Date(status.lastCheckedAt).toLocaleString()
                    : 'Never'
                }
              />
              <Row
                label="Last accepted"
                value={
                  status.lastOkAt
                    ? new Date(status.lastOkAt).toLocaleString()
                    : 'Never'
                }
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Only while orders are actually handed over. Shown any earlier it would
          be a question about a situation the merchant is not in, and the answer
          does nothing until they are: an order NCOM processes is one no other
          system saw, so NCOM reports it whatever this says. */}
      {forwarding && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="font-medium">Who reports the sale to Meta</h3>
              <p className="text-muted-foreground text-sm">
                Your landing pages here and the website taking these orders
                normally run the same pixel. If both report a sale, Meta has no
                id in common to match the two reports on and counts{' '}
                <strong>two purchases and twice the revenue</strong> — which is
                what your ad costs are then measured against. One side reports.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Reporter
                selected={siteReportsPurchase}
                title="My website reports it"
                detail="Right when your site sends purchases to Meta from its server, off the order we hand it. Nothing changes on your side."
                disabled={pending}
                onSelect={() =>
                  run(() => setPurchaseReportingAction('OWN_WEBSITE'))
                }
              />
              <Reporter
                selected={!siteReportsPurchase}
                title="NCOM reports it"
                detail="Right when your site only fires its pixel in the browser. A buyer who closes the tab before your confirmation page loads is a sale it never reports — we always see it."
                disabled={pending}
                onSelect={() => run(() => setPurchaseReportingAction('NCOM'))}
              />
            </div>

            <p className="text-muted-foreground text-sm">
              Page views and product views are reported by NCOM either way. Your
              website never serves the landing page, so it has nothing to say
              about who looked at it — only the sale is in question here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* The interaction merchants get wrong, said once, where it applies. A
          shop whose stock NCOM can already reserve will have that reservation
          silently switched off when orders start being handed over, and finding
          that out from a stock discrepancy is a bad afternoon. */}
      {hasCatalogConnection && (
        <p className="text-muted-foreground text-sm">
          Your products are read live from your website. When orders are
          processed there, NCOM stops calling <code>/reserve</code> — the order
          it hands you is what takes the stock, the same way an order on your
          own storefront does. Nothing is taken twice.
        </p>
      )}
    </div>
  )
}

function Choice({
  selected,
  title,
  summary,
  points,
  action,
}: {
  selected: boolean
  title: string
  summary: string
  points: string[]
  action: React.ReactNode
}) {
  return (
    <Card
      className={cn(
        'transition-colors',
        selected ? 'border-primary' : 'border-border'
      )}
    >
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium">{title}</h3>
          {selected && <Badge variant="outline">Current</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">{summary}</p>
        <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0" />
              {point}
            </li>
          ))}
        </ul>
        {action && <div className="mt-auto pt-2">{action}</div>}
      </CardContent>
    </Card>
  )
}

function Reporter({
  selected,
  title,
  detail,
  disabled,
  onSelect,
}: {
  selected: boolean
  title: string
  detail: string
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled || selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:bg-muted/50 disabled:hover:bg-transparent'
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {selected && <Check className="size-3.5 shrink-0" />}
        {title}
      </span>
      <span className="text-muted-foreground text-sm">{detail}</span>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-xs break-all">{value}</dd>
    </div>
  )
}

function Secret({ keyId, secret }: { keyId: string; secret: string }) {
  const [copied, setCopied] = useState(false)
  const block = `NCOM_ORDER_KEY_ID=${keyId}\nNCOM_ORDER_SECRET=${secret}`

  return (
    <Card className="border-amber-500/40">
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="font-medium">Copy this now — it is not shown again</p>
        <p className="text-muted-foreground">
          Your endpoint verifies with these. We send the key id as{' '}
          <code>X-NCOM-Key</code> and sign the body with the secret; anything
          that does not verify must be refused with a 401.
        </p>

        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
          {block}
        </pre>

        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            void navigator.clipboard.writeText(block)
            setCopied(true)
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </CardContent>
    </Card>
  )
}
