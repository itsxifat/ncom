'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * A line item's picture, small on the page and full size when clicked.
 *
 * Order lines carry the title, the SKU and the price, and for a merchant
 * picking three shirts out of a rack none of that is what identifies the goods
 * — the photo is. It matters more on the customer's tracking page, where the
 * question being answered is "is this the thing I bought", which a product
 * title in a font they have never seen answers poorly.
 *
 * Clicking opens it. There is deliberately no hover treatment: on a phone —
 * where most of these pages are read in this market — hover either does not
 * exist or fires on the tap that was meant to open the thing, and a picture
 * that changes under your finger reads as a mis-tap.
 */
export function ProductThumb({
  src,
  alt,
  size = 'md',
  className,
}: {
  src: string | null
  /** The product's own name. Alt text on an empty box would be a lie. */
  alt: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const box = size === 'sm' ? 'size-11' : 'size-14'

  if (!src) {
    return (
      <div
        className={cn(
          'bg-muted text-muted-foreground/40 flex shrink-0 items-center justify-center rounded-lg',
          box,
          className
        )}
        aria-hidden
      >
        <ImageOff className="size-4" />
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'bg-muted shrink-0 cursor-zoom-in overflow-hidden rounded-lg',
          box,
          className
        )}
        aria-label={`View ${alt} larger`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist */}
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          loading="lazy"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{alt}</DialogTitle>
          </DialogHeader>
          {/* Contained rather than cropped: this is the view someone opened to
              look at the product properly, so a tall photo must not lose its
              top and bottom the way the thumbnail does. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist */}
          <img
            src={src}
            alt={alt}
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
