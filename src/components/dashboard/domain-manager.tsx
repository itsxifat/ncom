'use client'

import Link from 'next/link'
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react'
import { Check, Copy, Globe2, RefreshCw, Star, Trash2 } from 'lucide-react'
import {
  addDomainAction,
  removeDomainAction,
  setPrimaryDomainAction,
  verifyDomainAction,
  type DomainActionState,
} from '@/app/(dashboard)/stores/[storeId]/settings/domain-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'

export interface DomainRow {
  id: string
  hostname: string
  status: string
  recordType: string
  isPrimary: boolean
  verificationToken: string
  challengeHost: string
  lastError: string | null
  lastCheckedAt: string | null
}

/**
 * Connecting a custom domain.
 *
 * The DNS instructions are the important part of this component, so they are
 * shown inline for every unverified domain rather than behind a dialog: a tenant
 * is switching between this screen and their registrar's control panel, and
 * anything they have to click to reveal is something they will mistype.
 *
 * Both records are always shown. The TXT record proves they own the name and the
 * CNAME/A record makes traffic arrive — people routinely add one and wonder why
 * nothing works, so the two are labelled with what each one does.
 */
export function DomainManager({
  storeId,
  domains,
  cnameTarget,
  aRecordIp,
  canAdd,
  limitLabel,
}: {
  storeId: string
  domains: DomainRow[]
  cnameTarget: string
  aRecordIp: string | null
  canAdd: boolean
  limitLabel: string
}) {
  const [state, action, pending] = useActionState<DomainActionState, FormData>(
    addDomainAction.bind(null, storeId),
    undefined
  )
  const [rowState, setRowState] = useState<DomainActionState>(undefined)
  const [isPending, startTransition] = useTransition()

  const run = (work: () => Promise<DomainActionState>) =>
    startTransition(async () => setRowState(await work()))

  return (
    <div className="flex flex-col gap-4">
      {domains.length > 0 && (
        <div className="flex flex-col gap-3">
          {domains.map((domain) => (
            <Card key={domain.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Globe2 className="text-muted-foreground size-4" />
                      <span className="font-mono text-sm">
                        {domain.hostname}
                      </span>
                      <Badge
                        variant={
                          domain.status === 'VERIFIED'
                            ? 'secondary'
                            : domain.status === 'FAILED'
                              ? 'destructive'
                              : 'outline'
                        }
                      >
                        {domain.status.toLowerCase()}
                      </Badge>
                      {domain.isPrimary && (
                        <Badge variant="outline">Primary</Badge>
                      )}
                    </p>
                    {domain.status === 'VERIFIED' ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Live at{' '}
                        <a
                          href={`https://${domain.hostname}`}
                          className="underline underline-offset-2"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          https://{domain.hostname}
                        </a>
                      </p>
                    ) : (
                      domain.lastCheckedAt && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Last checked{' '}
                          {new Date(domain.lastCheckedAt).toLocaleString()}
                        </p>
                      )
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {domain.status !== 'VERIFIED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          run(() => verifyDomainAction(storeId, domain.id))
                        }
                      >
                        <RefreshCw />
                        {isPending ? 'Checking…' : 'Verify'}
                      </Button>
                    )}
                    {domain.status === 'VERIFIED' && !domain.isPrimary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() =>
                          run(() => setPrimaryDomainAction(storeId, domain.id))
                        }
                      >
                        <Star />
                        Make primary
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="destructive"
                      title="Remove domain"
                      disabled={isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Remove ${domain.hostname}? Visitors using it will stop reaching this site.`
                          )
                        ) {
                          return
                        }
                        run(() => removeDomainAction(storeId, domain.id))
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {domain.status !== 'VERIFIED' && (
                  <div className="bg-muted flex flex-col gap-3 rounded-xl p-3 text-xs">
                    <p className="font-medium">
                      Add these two records at your DNS provider
                    </p>

                    <div className="flex flex-col gap-1">
                      <p className="text-muted-foreground">
                        1. Proves you own the domain
                      </p>
                      <DnsRow
                        type="TXT"
                        name={domain.challengeHost}
                        value={domain.verificationToken}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <p className="text-muted-foreground">
                        2. Sends visitors to your site
                      </p>
                      {domain.recordType === 'CNAME' ? (
                        <DnsRow
                          type="CNAME"
                          name={domain.hostname}
                          value={cnameTarget}
                        />
                      ) : aRecordIp ? (
                        <DnsRow
                          type="A"
                          name={domain.hostname}
                          value={aRecordIp}
                        />
                      ) : (
                        <p className="text-muted-foreground">
                          This is a root domain, which cannot use a CNAME. Use
                          your provider&apos;s ALIAS or ANAME record pointing at{' '}
                          <span className="font-mono">{cnameTarget}</span>, or
                          add a<span className="font-mono"> www</span> subdomain
                          instead.
                        </p>
                      )}
                    </div>

                    <p className="text-muted-foreground">
                      DNS changes usually appear within minutes but can take up
                      to an hour.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rowState?.error && <FieldError>{rowState.error}</FieldError>}
      {rowState?.notice && (
        <p className="text-sm text-emerald-600">
          <Check className="mr-1 inline size-4" />
          {rowState.notice}
        </p>
      )}

      <Card>
        <CardContent>
          <form action={action} className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="hostname">Add a domain</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="hostname"
                  name="hostname"
                  placeholder="shop.example.com"
                  className="font-mono"
                  disabled={!canAdd}
                />
                <Button type="submit" disabled={pending || !canAdd}>
                  {pending ? 'Adding…' : 'Add'}
                </Button>
              </div>
              <FieldDescription>
                Your plan includes {limitLabel}. Paste the domain without
                https://
              </FieldDescription>
              {state?.error && <FieldError>{state.error}</FieldError>}
              {state?.upgradeNeeded && (
                <Link
                  href="/billing/plans"
                  className="text-foreground text-xs underline underline-offset-4"
                >
                  See plans with more domains
                </Link>
              )}
              {state?.notice && (
                <p className="text-sm text-emerald-600">{state.notice}</p>
              )}
            </Field>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * One field of a DNS record: click anywhere on it to copy.
 *
 * The value wraps instead of truncating. These are the strings a tenant has to
 * reproduce exactly in someone else's control panel — a verification token that
 * is 32 characters of hex is unreadable when it is clipped at the card edge, and
 * a half-visible value invites retyping it by hand and getting it wrong.
 */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    },
    []
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // `navigator.clipboard` needs a secure context, which a staging box served
      // over plain http on a LAN address is not. Falling back keeps the button
      // honest there instead of silently doing nothing.
      const scratch = document.createElement('textarea')
      scratch.value = value
      scratch.setAttribute('readonly', '')
      scratch.className = 'fixed top-0 left-0 opacity-0'
      document.body.appendChild(scratch)
      scratch.select()
      document.execCommand('copy')
      scratch.remove()
    }

    setCopied(true)
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label.toLowerCase()}: ${value}`}
      className="group border-border/70 hover:border-border hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/25 flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-3"
    >
      <span className="text-muted-foreground w-11 shrink-0 pt-0.5 text-[0.6875rem] tracking-wide uppercase">
        {label}
      </span>
      <code className="text-foreground min-w-0 flex-1 font-mono text-[0.8125rem] leading-5 break-all">
        {value}
      </code>
      <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[0.6875rem]">
        {copied ? (
          <>
            <Check className="size-3.5 text-emerald-600" />
            <span className="text-emerald-600">Copied</span>
          </>
        ) : (
          <Copy className="text-muted-foreground/70 group-hover:text-foreground size-3.5 transition-colors" />
        )}
      </span>
    </button>
  )
}

/** One DNS record, laid out so each part can be copied without the labels. */
function DnsRow({
  type,
  name,
  value,
}: {
  type: string
  name: string
  value: string
}) {
  return (
    <div className="bg-card flex flex-col gap-1.5 rounded-lg p-2">
      <span className="text-muted-foreground w-fit rounded border px-1.5 py-0.5 font-mono text-[0.6875rem] tracking-wide">
        {type}
      </span>
      <CopyField label="Name" value={name} />
      <CopyField label="Value" value={value} />
    </div>
  )
}
