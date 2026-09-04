'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  PlugZap,
  RefreshCw,
  Unplug,
} from 'lucide-react'
import {
  disconnectProductSourceAction,
  rotateProductSourceSecretAction,
  saveProductSourceAction,
  testProductSourceAction,
  type ConnectResult,
} from '@/app/(dashboard)/settings/product-source/actions'
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

export interface ProductSourceStatus {
  baseUrl: string
  keyId: string
  secretHint: string
  timeoutMs: number
  capabilities: Record<string, boolean>
  platform: string | null
  currencyCode: string | null
  lastCheckedAt: string | null
  lastOkAt: string | null
  lastError: string | null
}

/**
 * Where a workspace's products come from.
 *
 * The screen is built around one fact that has to land before anything else on
 * it makes sense: NCOM keeps no copy of the catalogue. So the panel leads with
 * that, shows what the connected site can do rather than what we wish it did,
 * and is honest about the one capability whose absence changes what the
 * platform can promise — a site with no `/reserve` endpoint cannot hold stock
 * for an order, and this says so instead of letting a merchant assume it does.
 *
 * The secret is shown exactly once. It is stored encrypted and cannot be read
 * back, which is the same rule as API keys and for the same reason.
 */
export function ProductSourceManager({
  status,
  currencyCode,
}: {
  status: ProductSourceStatus | null
  currencyCode: string
}) {
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? '')
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<ConnectResult>) {
    setResult(null)
    startTransition(async () => setResult(await action()))
  }

  const capabilities = status?.capabilities ?? {}
  const canReserve = capabilities.reserve === true
  const currencyMismatch =
    status?.currencyCode && status.currencyCode !== currencyCode

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="baseUrl">Connector base URL</FieldLabel>
            <Input
              id="baseUrl"
              value={baseUrl}
              placeholder="https://yourshop.com/ncom/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <FieldDescription>
              The address the connector answers on. Every endpoint in the
              contract hangs off it — we call <code>{'{base}'}/ping</code>,{' '}
              <code>{'{base}'}/products</code> and the rest.{' '}
              <Link href="/docs#product-source" className="underline">
                How to build it
              </Link>
              .
            </FieldDescription>
            {result?.error && <FieldError>{result.error}</FieldError>}
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || baseUrl.trim().length === 0}
              onClick={() => run(() => saveProductSourceAction(baseUrl))}
            >
              {pending ? <Loader2 className="animate-spin" /> : <PlugZap />}
              {status ? 'Save and test' : 'Connect'}
            </Button>

            {status && (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(testProductSourceAction)}
                >
                  <RefreshCw />
                  Test now
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(rotateProductSourceSecretAction)}
                >
                  Rotate secret
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => run(disconnectProductSourceAction)}
                >
                  <Unplug />
                  Disconnect
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

      {status && (
        <Card>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Status</span>
              {status.lastOkAt ? (
                <Badge variant="outline" className="text-emerald-600">
                  Answering
                </Badge>
              ) : (
                <Badge variant="destructive">Never answered</Badge>
              )}
              {status.platform && (
                <Badge variant="outline">{status.platform}</Badge>
              )}
            </div>

            {status.lastError && (
              <p className="text-destructive flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {status.lastError}
              </p>
            )}

            {currencyMismatch && (
              <p className="flex items-start gap-2 text-amber-600">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Your website quotes prices in {status.currencyCode} and this
                workspace sells in {currencyCode}. Nothing converts between them
                — a price read as {status.currencyCode} and charged as{' '}
                {currencyCode} is the wrong amount. Fix one of the two.
              </p>
            )}

            <dl className="grid gap-2 sm:grid-cols-2">
              <Row label="Key id" value={status.keyId} />
              <Row label="Shared secret" value={status.secretHint} />
              <Row label="Timeout" value={`${status.timeoutMs}ms`} />
              <Row
                label="Last checked"
                value={
                  status.lastCheckedAt
                    ? new Date(status.lastCheckedAt).toLocaleString()
                    : 'Never'
                }
              />
            </dl>

            <div>
              <p className="mb-2 font-medium">What your site implements</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'products', label: 'products', required: true },
                  { key: 'stock', label: 'stock', required: true },
                  { key: 'search', label: 'search', required: false },
                  { key: 'categories', label: 'categories', required: false },
                  { key: 'reserve', label: 'reserve', required: false },
                  { key: 'release', label: 'release', required: false },
                ].map((entry) => (
                  <Badge
                    key={entry.key}
                    variant={capabilities[entry.key] ? 'default' : 'outline'}
                    className={
                      capabilities[entry.key]
                        ? ''
                        : entry.required
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }
                  >
                    {capabilities[entry.key] ? '✓' : '—'} {entry.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* The one difference that changes what can be promised to a
                shopper, said plainly rather than left to be inferred from a
                grey badge above. */}
            <p
              className={
                canReserve ? 'text-muted-foreground' : 'text-amber-600'
              }
            >
              {canReserve ? (
                <>
                  Stock is <strong>held</strong> on your site while an order is
                  placed, and handed back if it fails. Two shoppers cannot buy
                  the same last unit.
                </>
              ) : (
                <>
                  Your site does not implement <code>/reserve</code>, so stock
                  is checked but not held. Two shoppers reaching the last unit
                  at the same moment will both get an order. Implement{' '}
                  <code>/reserve</code> and <code>/release</code> to close that
                  window.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
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

  return (
    <Card className="border-amber-500/40">
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="font-medium">Copy this now — it is not shown again</p>
        <p className="text-muted-foreground">
          Put both values in your connector&apos;s configuration. We send the
          key id as <code>X-NCOM-Key</code> and sign every request with the
          secret; your endpoint verifies the signature and refuses anything
          else.
        </p>

        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
          {`NCOM_KEY_ID=${keyId}\nNCOM_SECRET=${secret}`}
        </pre>

        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            void navigator.clipboard.writeText(
              `NCOM_KEY_ID=${keyId}\nNCOM_SECRET=${secret}`
            )
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
