'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react'
import {
  createWebhookAction,
  deleteWebhookAction,
  redeliverWebhookAction,
  rotateWebhookSecretAction,
  testWebhookAction,
  updateWebhookAction,
} from '@/app/(dashboard)/settings/developer-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { WebhookTopic } from '@/generated/prisma/enums'

export interface WebhookRow {
  id: string
  url: string
  description: string | null
  topics: WebhookTopic[]
  isActive: boolean
  consecutiveFailures: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastErrorMessage: string | null
  succeeded: number
  failed: number
  pending: number
}

export interface DeliveryRow {
  id: string
  topic: WebhookTopic
  eventId: string
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  attempts: number
  statusCode: number | null
  error: string | null
  createdAt: string
  url: string
}

export interface TopicOption {
  topic: WebhookTopic
  wire: string
  description: string
}

export function WebhookManager({
  endpoints,
  deliveries,
  topics,
}: {
  endpoints: WebhookRow[]
  deliveries: DeliveryRow[]
  topics: TopicOption[]
}) {
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  const wireByTopic = new Map(topics.map((entry) => [entry.topic, entry.wire]))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            We POST a signed JSON event to these URLs when products, stock,
            categories or orders change.{' '}
            <Link href="/docs#webhooks" className="underline" target="_blank">
              How to verify the signature
            </Link>
            .
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Add endpoint
          </Button>
        </div>

        {endpoints.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            <Webhook className="mx-auto mb-2 size-5" />
            No endpoints yet. Add one to keep another system in step with this
            one.
          </div>
        ) : (
          <div className="bg-card divide-y overflow-hidden rounded-xl border">
            {endpoints.map((endpoint) => (
              <EndpointRow
                key={endpoint.id}
                row={endpoint}
                wireByTopic={wireByTopic}
                onSecret={setSecret}
              />
            ))}
          </div>
        )}
      </div>

      {deliveries.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Recent deliveries</h2>
            <p className="text-muted-foreground text-sm">
              Every attempt is recorded, so a missed event can be traced and
              re-sent.
            </p>
          </div>

          <div className="bg-card divide-y overflow-hidden rounded-xl border">
            {deliveries.map((delivery) => (
              <DeliveryRowView
                key={delivery.id}
                row={delivery}
                wire={wireByTopic.get(delivery.topic) ?? delivery.topic}
              />
            ))}
          </div>
        </section>
      )}

      <CreateEndpointDialog
        open={creating}
        topics={topics}
        onClose={() => setCreating(false)}
        onCreated={(value) => {
          setCreating(false)
          setSecret(value)
        }}
      />

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  )
}

function EndpointRow({
  row,
  wireByTopic,
  onSecret,
}: {
  row: WebhookRow
  wireByTopic: Map<WebhookTopic, string>
  onSecret: (secret: string) => void
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<void>) {
    setError(null)
    setStatus(null)
    startTransition(action)
  }

  return (
    <div className="flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-mono text-sm">{row.url}</p>
          {!row.isActive && <Badge variant="secondary">Paused</Badge>}
          {row.consecutiveFailures > 0 && (
            <Badge variant="destructive">
              <AlertTriangle className="size-3" />
              {row.consecutiveFailures} failing
            </Badge>
          )}
        </div>

        <p className="text-muted-foreground mt-1 text-xs">
          {row.topics
            .map((topic) => wireByTopic.get(topic) ?? topic)
            .join(', ')}
        </p>

        <p className="text-muted-foreground mt-0.5 text-xs">
          {row.succeeded} delivered · {row.failed} failed · {row.pending} queued
          {row.lastSuccessAt &&
            ` · last success ${new Date(row.lastSuccessAt).toLocaleString()}`}
        </p>

        {row.lastErrorMessage && !row.lastSuccessAt && (
          <p className="text-destructive mt-1 text-xs">
            Last error: {row.lastErrorMessage}
          </p>
        )}

        {status && <p className="mt-1 text-xs text-emerald-600">{status}</p>}
        {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await testWebhookAction(row.id)
              if (!result.ok) {
                setError(result.error)
                return
              }
              setStatus(
                result.succeeded
                  ? `Test event delivered (HTTP ${result.statusCode}).`
                  : `Test failed: ${result.error ?? `HTTP ${result.statusCode}`}`
              )
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Test
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await updateWebhookAction(row.id, {
                isActive: !row.isActive,
              })
              if (!result.ok) setError(result.error)
            })
          }
        >
          {row.isActive ? 'Pause' : 'Resume'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          title="Issue a new signing secret. The old one stops working immediately."
          onClick={() =>
            run(async () => {
              const result = await rotateWebhookSecretAction(row.id)
              if (!result.ok) {
                setError(result.error)
                return
              }
              onSecret(result.secret)
            })
          }
        >
          <RefreshCw />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete endpoint"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await deleteWebhookAction(row.id)
              if (!result.ok) setError(result.error)
            })
          }
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function DeliveryRowView({ row, wire }: { row: DeliveryRow; wire: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <Badge
        variant={
          row.status === 'SUCCEEDED'
            ? 'lime'
            : row.status === 'FAILED'
              ? 'destructive'
              : 'secondary'
        }
      >
        {row.status.toLowerCase()}
      </Badge>

      <span className="font-mono text-xs">{wire}</span>

      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
        {new Date(row.createdAt).toLocaleString()} · attempt {row.attempts}
        {row.statusCode !== null && ` · HTTP ${row.statusCode}`}
        {row.error && ` · ${row.error}`}
      </span>

      {row.status !== 'SUCCEEDED' && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await redeliverWebhookAction(row.id)
              if (!result.ok) setError(result.error)
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : 'Retry'}
        </Button>
      )}

      {error && <p className="text-destructive w-full text-xs">{error}</p>}
    </div>
  )
}

function CreateEndpointDialog({
  open,
  topics,
  onClose,
  onCreated,
}: {
  open: boolean
  topics: TopicOption[]
  onClose: () => void
  onCreated: (secret: string) => void
}) {
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<WebhookTopic[]>([
    'INVENTORY_UPDATED',
    'PRODUCT_UPDATED',
    'ORDER_CREATED',
  ])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(topic: WebhookTopic) {
    setSelected((current) =>
      current.includes(topic)
        ? current.filter((candidate) => candidate !== topic)
        : [...current, topic]
    )
  }

  function submit() {
    if (url.trim() === '') {
      setError('Enter the URL we should POST to.')
      return
    }
    if (selected.length === 0) {
      setError('Choose at least one event.')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await createWebhookAction(
        url.trim(),
        selected,
        description.trim()
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setUrl('')
      setDescription('')
      onCreated(result.secret)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a webhook endpoint</DialogTitle>
          <DialogDescription>
            We will POST a signed JSON body to this URL whenever one of the
            chosen events happens.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="hook-url">Endpoint URL</FieldLabel>
          <Input
            id="hook-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://yourshop.com/api/ncom-webhook"
          />
          <FieldDescription>
            Must be https and reachable from the internet.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="hook-description">Description</FieldLabel>
          <Input
            id="hook-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Main site stock sync"
          />
        </Field>

        <Field>
          <FieldLabel>Events</FieldLabel>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {topics.map((entry) => (
              <label
                key={entry.topic}
                className="hover:bg-muted flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5"
              >
                <Checkbox
                  checked={selected.includes(entry.topic)}
                  onCheckedChange={() => toggle(entry.topic)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs">{entry.wire}</span>
                  <span className="text-muted-foreground block text-xs">
                    {entry.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : 'Add endpoint'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SecretDialog({
  secret,
  onClose,
}: {
  secret: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <Dialog open={secret !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy the signing secret</DialogTitle>
          <DialogDescription>
            Your endpoint uses this to verify that a delivery really came from
            us. Shown once.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted flex items-center gap-2 rounded-lg border p-3">
          <code className="min-w-0 flex-1 font-mono text-xs break-all">
            {secret}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!secret) return
              await navigator.clipboard.writeText(secret)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
