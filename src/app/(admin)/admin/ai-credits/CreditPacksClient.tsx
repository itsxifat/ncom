'use client'

import { useState, useTransition } from 'react'
import { Coins, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteCreditPackAction, saveCreditPackAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { centsToMajorString, formatMoney } from '@/lib/money'

export interface PackRow {
  id: string
  name: string
  credits: number
  currencyCode: string
  priceCents: number
  isActive: boolean
  position: number
}

/** The packs workspaces can buy, and the editor for them. */
export function CreditPacksClient({ packs }: { packs: PackRow[] }) {
  const [editing, setEditing] = useState<PackRow | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus />
          New pack
        </Button>
      </div>
      {packs.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No credit packs yet"
          description="Add a pack — say 100 credits for ৳499 — and workspaces can buy it from Plan & billing."
        />
      ) : (
        <ListPanel>
          {packs.map((pack) => (
            <ListRow key={pack.id}>
              <ListRowText
                title={pack.name}
                meta={`${pack.credits.toLocaleString()} credits · ${formatMoney(Math.round(pack.priceCents / Math.max(pack.credits, 1)), pack.currencyCode)} per credit`}
                badges={
                  !pack.isActive && <Badge variant="outline">Not on sale</Badge>
                }
              />
              <ListRowActions>
                <span className="font-medium tabular-nums">
                  {pack.priceCents === 0
                    ? 'Free'
                    : formatMoney(pack.priceCents, pack.currencyCode)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${pack.name}`}
                  onClick={() => setEditing(pack)}
                >
                  <Pencil />
                </Button>
                <DeletePack pack={pack} />
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
      <PackDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        pack={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function DeletePack({ pack }: { pack: PackRow }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${pack.name}`}
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Delete “${pack.name}”? Orders already placed for it keep their details.`
          )
        ) {
          return
        }
        startTransition(async () => {
          await deleteCreditPackAction(pack.id)
          toast.success('Pack deleted')
        })
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  )
}

function PackDialog({
  pack,
  open,
  onClose,
}: {
  pack: PackRow | null
  open: boolean
  onClose: () => void
}) {
  const currency = pack?.currencyCode ?? 'BDT'
  const [name, setName] = useState(pack?.name ?? '')
  const [credits, setCredits] = useState(String(pack?.credits ?? 100))
  const [price, setPrice] = useState(
    pack ? centsToMajorString(pack.priceCents, currency) : ''
  )
  const [position, setPosition] = useState(String(pack?.position ?? 0))
  const [isActive, setIsActive] = useState(pack?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  function save() {
    setError(null)
    startSave(async () => {
      const result = await saveCreditPackAction(pack?.id ?? null, {
        name,
        credits,
        price: price || '0',
        currencyCode: currency,
        isActive,
        position,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(pack ? 'Pack saved' : 'Pack added')
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pack ? 'Edit credit pack' : 'New credit pack'}
          </DialogTitle>
          <DialogDescription>
            Workspaces see the name, the credits and the price on Plan &amp;
            billing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="pack-name">Name</FieldLabel>
            <Input
              id="pack-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Starter pack"
              maxLength={60}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="pack-credits">Credits</FieldLabel>
              <Input
                id="pack-credits"
                inputMode="numeric"
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pack-price">Price ({currency})</FieldLabel>
              <Input
                id="pack-price"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="499"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="pack-position">Order on the page</FieldLabel>
            <Input
              id="pack-position"
              inputMode="numeric"
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              className="w-24"
            />
            <FieldDescription>Lower numbers come first.</FieldDescription>
          </Field>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">On sale</span>
            <Switch
              checked={isActive}
              onCheckedChange={(next: boolean) => setIsActive(next)}
            />
          </label>
          {error && <FieldError>{error}</FieldError>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {pack ? 'Save pack' : 'Add pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
