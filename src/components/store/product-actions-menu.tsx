'use client'

import { useState, useTransition } from 'react'
import {
  Archive,
  Copy,
  ExternalLink,
  Eye,
  FileEdit,
  Loader2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'
import {
  archiveProductAction,
  bulkProductStatusAction,
  deleteProductAction,
  duplicateProductAction,
} from '@/app/(dashboard)/commerce-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FieldError } from '@/components/ui/field'

/**
 * Everything you can do to one product, at the top of its page.
 *
 * These used to be spread across the editor: publishing was a select buried in
 * the form, deleting lived in a "danger zone" below the fold, and duplicating
 * was only reachable from the list. A merchant who opened a product to archive
 * it had to scroll past forty fields to find out how.
 *
 * Delete is last, separated, and destructive-styled — and its dialog offers
 * archive first, because a product that has ever sold cannot be deleted (the
 * service refuses to orphan an order line) and archiving is what was wanted
 * nearly every time anyway.
 */
export function ProductActionsMenu({
  productId,
  title,
  status,
  storefrontUrl,
}: {
  productId: string
  title: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  /** The product on this workspace's own storefront, when it is live on one. */
  storefrontUrl: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<{ error?: string } | undefined>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      setError(result?.error ?? null)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && (
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
      )}
      {error && <FieldError>{error}</FieldError>}

      {status !== 'ACTIVE' ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => bulkProductStatusAction([productId], 'ACTIVE'))
          }
        >
          <Eye />
          Publish
        </Button>
      ) : (
        storefrontUrl && (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a href={storefrontUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                View on storefront
              </a>
            }
          />
        )
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" title="More actions">
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {status !== 'ACTIVE' && storefrontUrl && (
            <DropdownMenuItem
              render={
                <a href={storefrontUrl} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink /> Preview on storefront
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() =>
              startTransition(async () => {
                await duplicateProductAction(productId)
              })
            }
          >
            <Copy /> Duplicate
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {status !== 'DRAFT' && (
            <DropdownMenuItem
              onClick={() =>
                run(() => bulkProductStatusAction([productId], 'DRAFT'))
              }
            >
              <FileEdit /> Move to draft
            </DropdownMenuItem>
          )}
          {status !== 'ARCHIVED' && (
            <DropdownMenuItem
              onClick={() => run(() => archiveProductAction(productId))}
            >
              <Archive /> Archive
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{title}”?</DialogTitle>
            <DialogDescription>
              This cannot be undone. If it appears on any order it will be kept
              instead — an order has to keep pointing at what it sold.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {status !== 'ARCHIVED' && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setConfirming(false)
                  run(() => archiveProductAction(productId))
                }}
              >
                <Archive />
                Archive instead — keeps it and its order history
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirming(false)
                // A successful delete redirects to the list, so anything this
                // sets is the refusal.
                run(() => deleteProductAction(productId))
              }}
            >
              <Trash2 />
              {pending ? 'Deleting…' : 'Delete permanently'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
