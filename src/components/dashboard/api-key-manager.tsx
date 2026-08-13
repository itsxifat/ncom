'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import {
  createApiKeyAction,
  deleteApiKeyAction,
  revokeApiKeyAction,
} from '@/app/(dashboard)/settings/developer-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { FormSelect } from '@/components/store/form-controls'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ApiScope } from '@/generated/prisma/enums'

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  last4: string
  scopes: ApiScope[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  createdByName: string | null
  /**
   * Computed on the server rather than from `Date.now()` in render.
   *
   * A component that reads the clock while rendering produces different output
   * for the same props, which React is free to treat as a bug — and the answer
   * here does not need to be live to the second anyway.
   */
  isExpired: boolean
}

export function ApiKeyManager({
  keys,
  scopes,
}: {
  keys: ApiKeyRow[]
  scopes: { scope: ApiScope; label: string; description: string }[]
}) {
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Keys let another system read and write this workspace&rsquo;s
          catalogue.{' '}
          <Link href="/docs" className="underline" target="_blank">
            Read the API docs
          </Link>
          .
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          New API key
        </Button>
      </div>

      {keys.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          <KeyRound className="mx-auto mb-2 size-5" />
          No API keys yet.
        </div>
      ) : (
        <div className="bg-card divide-y overflow-hidden rounded-xl border">
          {keys.map((key) => (
            <ApiKeyRowView key={key.id} row={key} />
          ))}
        </div>
      )}

      <CreateKeyDialog
        open={creating}
        scopes={scopes}
        onClose={() => setCreating(false)}
        onIssued={(token) => {
          setCreating(false)
          setIssued(token)
        }}
      />

      <IssuedKeyDialog token={issued} onClose={() => setIssued(null)} />
    </div>
  )
}

function ApiKeyRowView({ row }: { row: ApiKeyRow }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const revoked = row.revokedAt !== null

  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{row.name}</p>
          {revoked && <Badge variant="destructive">Revoked</Badge>}
          {!revoked && row.isExpired && (
            <Badge variant="secondary">Expired</Badge>
          )}
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          {row.prefix}.****{row.last4}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {row.scopes.length}{' '}
          {row.scopes.length === 1 ? 'permission' : 'permissions'}
          {' · '}
          {row.lastUsedAt
            ? `last used ${new Date(row.lastUsedAt).toLocaleDateString()}`
            : 'never used'}
          {row.createdByName && ` · created by ${row.createdByName}`}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {!revoked ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await revokeApiKeyAction(row.id)
                if (!result.ok) setError(result.error)
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : 'Revoke'}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete key"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteApiKeyAction(row.id)
                if (!result.ok) setError(result.error)
              })
            }
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {error && <p className="text-destructive w-full text-xs">{error}</p>}
    </div>
  )
}

function CreateKeyDialog({
  open,
  scopes,
  onClose,
  onIssued,
}: {
  open: boolean
  scopes: { scope: ApiScope; label: string; description: string }[]
  onClose: () => void
  onIssued: (token: string) => void
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<ApiScope[]>([
    'PRODUCTS_READ',
    'INVENTORY_READ',
  ])
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(scope: ApiScope) {
    setSelected((current) =>
      current.includes(scope)
        ? current.filter((candidate) => candidate !== scope)
        : [...current, scope]
    )
  }

  function submit() {
    if (name.trim() === '') {
      setError('Give the key a name so you can tell it apart later.')
      return
    }
    if (selected.length === 0) {
      setError('Choose at least one permission.')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await createApiKeyAction(
        name.trim(),
        selected,
        expiry ? Number(expiry) : null
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setName('')
      onIssued(result.token)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New API key</DialogTitle>
          <DialogDescription>
            Give it only the permissions the integration needs. You can revoke
            it at any time.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="key-name">Name</FieldLabel>
          <Input
            id="key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Warehouse stock sync"
          />
          <FieldDescription>
            Shown in the key list and in your usage logs.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Permissions</FieldLabel>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {scopes.map((entry) => (
              <label
                key={entry.scope}
                className="hover:bg-muted flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5"
              >
                <Checkbox
                  checked={selected.includes(entry.scope)}
                  onCheckedChange={() => toggle(entry.scope)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {entry.label}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {entry.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="key-expiry">Expires</FieldLabel>
          <FormSelect
            id="key-expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          >
            <option value="">Never</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
          </FormSelect>
          <FieldDescription>
            An expiring key limits the damage if it ever leaks.
          </FieldDescription>
        </Field>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : 'Create key'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The one and only time the token is visible.
 *
 * Said plainly rather than politely, because a merchant who closes this without
 * copying has to create a new key and update whatever they were configuring —
 * and they will not find out until the integration fails.
 */
function IssuedKeyDialog({
  token,
  onClose,
}: {
  token: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <Dialog open={token !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy your API key now</DialogTitle>
          <DialogDescription>
            This is the only time it will be shown. We store a hash of it, so we
            cannot show it to you again — if you lose it, create a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted flex items-center gap-2 rounded-lg border p-3">
          <code className="min-w-0 flex-1 font-mono text-xs break-all">
            {token}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!token) return
              await navigator.clipboard.writeText(token)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>I have copied it</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
