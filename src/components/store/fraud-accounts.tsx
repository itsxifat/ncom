'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  addFraudAccountAction,
  removeFraudAccountAction,
  testFraudAccountsAction,
  toggleFraudAccountAction,
  type CourierActionState,
} from '@/app/(dashboard)/courier-actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

export interface FraudAccountRow {
  id: string
  email: string
  label: string | null
  isActive: boolean
  isPrimary: boolean
  lastTestedAt: string | null
  lastTestOk: boolean | null
  lastTestMessage: string | null
  lastUsedAt: string | null
}

/**
 * The Steadfast merchant portal logins used to screen customers.
 *
 * Plural, and the UI leans on that: the portal locks accounts, rate limits them
 * and expires sessions, so a store running on one login has a screen that will
 * stop working on a Tuesday without saying so. Each account carries its own
 * health, tested by signing into each one individually rather than by asking
 * whether screening works at all — one healthy login otherwise hides three dead
 * ones right up until the last one goes.
 */
export function FraudAccounts({ accounts }: { accounts: FraudAccountRow[] }) {
  const [state, action, pending] = useActionState<CourierActionState, FormData>(
    addFraudAccountAction,
    undefined
  )
  const [testing, startTest] = useTransition()
  const [testSummary, setTestSummary] = useState<string | null>(null)

  const working = accounts.filter((a) => a.lastTestOk === true).length
  const failed = accounts.filter(
    (a) => a.lastTestedAt && a.lastTestOk === false
  ).length

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <ShieldAlert className="size-4" />
                Portal accounts
                {accounts.length > 0 && (
                  <Badge variant={failed > 0 ? 'destructive' : 'lime'}>
                    {working}/{accounts.length} working
                  </Badge>
                )}
              </p>
              <p className="text-muted-foreground mt-1 text-sm text-pretty">
                Lookups try these in order. Add more than one — Steadfast rate
                limits and locks accounts, and a screen running on a single
                login stops working without warning.
              </p>
            </div>

            {accounts.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={() =>
                  startTest(async () => {
                    const result = await testFraudAccountsAction()
                    setTestSummary(
                      result.ok
                        ? `${result.working} of ${result.total} account${result.total === 1 ? '' : 's'} signed in successfully.`
                        : (result.error ?? 'The test failed')
                    )
                  })
                }
              >
                {testing && <Loader2 className="animate-spin" />}
                Test all accounts
              </Button>
            )}
          </div>

          {testSummary && <p className="text-sm">{testSummary}</p>}

          {accounts.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              No portal accounts yet. Screening is off until you add one.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {accounts.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <p className="text-sm font-medium">Add an account</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="fraud-email">Portal email</FieldLabel>
                  <Input
                    id="fraud-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    placeholder="you@example.com"
                    required
                  />
                  <FieldDescription>
                    The login for merchant.packzy.com — not your API key.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="fraud-password">Password</FieldLabel>
                  <Input
                    id="fraud-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                  <FieldDescription>
                    Encrypted before it is stored and never shown again.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="fraud-label">Label (optional)</FieldLabel>
                <Input
                  id="fraud-label"
                  name="label"
                  placeholder="Main account"
                  maxLength={60}
                />
              </Field>

              {state?.error && (
                <p className="text-destructive text-sm">{state.error}</p>
              )}
              {state?.success && (
                <p className="text-sm text-emerald-600">{state.success}</p>
              )}

              <div>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add account
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function AccountRow({ account }: { account: FraudAccountRow }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const status = !account.lastTestedAt
    ? { Icon: Clock, label: 'Untested', className: 'text-muted-foreground' }
    : account.lastTestOk
      ? { Icon: CheckCircle2, label: 'Working', className: 'text-emerald-600' }
      : { Icon: XCircle, label: 'Failed', className: 'text-destructive' }

  const StatusIcon = status.Icon

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <StatusIcon className={`size-4 shrink-0 ${status.className}`} />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {account.email}
          {account.isPrimary && <Badge variant="secondary">Primary</Badge>}
          {!account.isActive && <Badge variant="outline">Paused</Badge>}
        </p>
        <p className="text-muted-foreground text-xs">
          {account.label && <>{account.label} · </>}
          <span className={status.className}>{status.label}</span>
          {account.lastTestMessage && !account.lastTestOk && (
            <> — {account.lastTestMessage}</>
          )}
          {account.lastUsedAt && (
            <>
              {' '}
              · last answered {new Date(account.lastUsedAt).toLocaleString()}
            </>
          )}
        </p>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <label className="flex items-center gap-2 text-xs">
        {/* Pausing rather than deleting: a locked account comes back, and
            retyping the password to restore it is needless friction. */}
        <Switch
          checked={account.isActive}
          disabled={pending}
          onCheckedChange={(checked) =>
            start(async () => {
              const result = await toggleFraudAccountAction(
                account.id,
                Boolean(checked)
              )
              if (!result.ok) setError(result.error ?? 'Could not update')
            })
          }
        />
        Use
      </label>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await removeFraudAccountAction(account.id)
            if (!result.ok) setError(result.error ?? 'Could not remove')
          })
        }
      >
        <Trash2 />
      </Button>
    </div>
  )
}
