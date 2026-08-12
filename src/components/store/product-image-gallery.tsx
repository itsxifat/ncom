'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Star, Trash2, UploadCloud, X } from 'lucide-react'
import { uploadMediaFile } from '@/lib/media-upload'
import { useImageCrop } from '@/components/media/use-image-crop'
import { listAvailableMediaAction } from '@/modules/builder/media-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * A product's photo gallery.
 *
 * Images are the part of a product a buyer actually decides on, and until now
 * there was no way to give a product one at all — the schema, the storefront
 * drops and the offer thumbnails all read `product.images`, and nothing in the
 * admin ever wrote to it.
 *
 * Order is meaning, not decoration: position 0 is the image used everywhere a
 * single one is needed (catalogue card, offer thumbnail, order line), so the
 * first tile is labelled "Main" and dragging is how a merchant chooses it.
 *
 * Images are held as `mediaId` references rather than URLs. The MediaAsset is
 * what has an owner and a storage key, so a photo stays replaceable and
 * deletable from the library after it is attached here — and a product cannot
 * be pointed at an arbitrary URL that nobody can manage afterwards.
 */

export interface ProductImageDraft {
  mediaId: string
  url: string
  altText: string
  position: number
}

const MAX_IMAGES = 250
const ACCEPTED = 'image/png,image/jpeg,image/webp,image/avif,image/gif'

export function ProductImageGallery({
  images,
  onChange,
}: {
  images: ProductImageDraft[]
  onChange: (images: ProductImageDraft[]) => void
}) {
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { requestCrop, cropper } = useImageCrop()

  const known = new Set(images.map((image) => image.mediaId))

  function append(next: ProductImageDraft[]) {
    // Re-numbered from zero on every mutation so "first" is unambiguous no
    // matter how the list was reached — drag, delete, or upload.
    const merged = [
      ...images,
      ...next.filter((image) => !known.has(image.mediaId)),
    ]
    onChange(merged.map((image, index) => ({ ...image, position: index })))
  }

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((file) => file.type.startsWith('image/'))
    if (list.length === 0) return

    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      setError(`A product can have at most ${MAX_IMAGES} images.`)
      return
    }

    setError(null)
    let batch = list.slice(0, room)

    // Cropping is offered for a single pick only. Selecting eight product
    // photos at once and being made to crop each in turn is worse than not
    // offering it — those can be cropped later from the media library.
    if (batch.length === 1) {
      const cropped = await requestCrop(batch[0])
      if (!cropped) return
      batch = [cropped]
    }

    setUploading((count) => count + batch.length)

    // Uploaded in parallel but appended together, so a slow third file cannot
    // land before a fast fourth and scramble the order the merchant chose.
    const settled = await Promise.allSettled(
      batch.map((file) => uploadMediaFile(file))
    )
    setUploading((count) => count - batch.length)

    const uploaded: ProductImageDraft[] = []
    let failures = 0
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        uploaded.push({
          mediaId: result.value.id,
          url: result.value.url,
          altText: result.value.altText ?? '',
          position: 0,
        })
      } else {
        failures++
      }
    }

    if (uploaded.length > 0) append(uploaded)
    if (failures > 0) {
      setError(
        `${failures} file${failures === 1 ? '' : 's'} could not be uploaded.`
      )
    }
  }

  function move(from: number, to: number) {
    if (from === to) return
    const next = [...images]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next.map((image, index) => ({ ...image, position: index })))
  }

  function remove(index: number) {
    onChange(
      images
        .filter((_, position) => position !== index)
        .map((image, position) => ({ ...image, position }))
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {cropper}
      <div
        onDragOver={(event) => {
          // Only for files from the desktop; a tile being reordered inside the
          // grid must not put the drop zone into its highlighted state.
          if (dragIndex !== null) return
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          if (dragIndex !== null) return
          event.preventDefault()
          setDragOver(false)
          void upload(event.dataTransfer.files)
        }}
        className={cn(
          'rounded-lg border border-dashed p-4 transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-input'
        )}
      >
        {images.length === 0 && uploading === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <UploadCloud className="text-muted-foreground size-7" />
            <p className="text-sm font-medium">
              Drag photos here, or choose files
            </p>
            <p className="text-muted-foreground text-xs">
              The first image is what shows on cards, offers and orders.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {images.map((image, index) => (
              <li
                key={image.mediaId}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (dragIndex !== null) move(dragIndex, index)
                  setDragIndex(null)
                }}
                className={cn(
                  'group bg-muted relative aspect-square cursor-grab overflow-hidden rounded-md border',
                  dragIndex === index && 'opacity-40'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist */}
                <img
                  src={image.url}
                  alt={image.altText}
                  className="size-full object-cover"
                />

                {index === 0 && (
                  <span className="bg-foreground text-background absolute top-1 left-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                    <Star className="size-2.5 fill-current" /> Main
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/55 p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => setEditing(index)}
                    className="truncate rounded px-1 text-[10px] font-medium text-white hover:underline"
                    title="Edit alt text"
                  >
                    {image.altText ? 'Alt ✓' : 'Add alt'}
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => move(index, 0)}
                        className="rounded p-0.5 text-white hover:bg-white/20"
                        title="Make this the main image"
                      >
                        <Star className="size-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="rounded p-0.5 text-white hover:bg-white/20"
                      title="Remove"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </li>
            ))}

            {Array.from({ length: uploading }).map((_, index) => (
              <li
                key={`uploading-${index}`}
                className="bg-muted text-muted-foreground flex aspect-square items-center justify-center rounded-md border"
              >
                <Loader2 className="size-5 animate-spin" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED}
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files)
            event.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus /> Upload
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setLibraryOpen(true)}
        >
          Choose from library
        </Button>
        <span className="text-muted-foreground text-xs">
          {images.length} of {MAX_IMAGES}
        </span>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <AltTextDialog
        image={editing === null ? null : images[editing]}
        onClose={() => setEditing(null)}
        onSave={(altText) => {
          if (editing === null) return
          onChange(
            images.map((image, index) =>
              index === editing ? { ...image, altText } : image
            )
          )
          setEditing(null)
        }}
      />

      <LibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        alreadyChosen={known}
        onPick={(picked) => {
          append(picked)
          setLibraryOpen(false)
        }}
      />
    </div>
  )
}

/**
 * Alt text, edited one image at a time.
 *
 * Worth a dialog rather than an inline field: it is the only accessible
 * description of the product a screen reader gets, and it is also what search
 * engines index, so it deserves more room than a caption slot under a thumbnail.
 */
function AltTextDialog({
  image,
  onClose,
  onSave,
}: {
  image: ProductImageDraft | null
  onClose: () => void
  onSave: (altText: string) => void
}) {
  const [value, setValue] = useState('')

  return (
    <Dialog
      open={image !== null}
      onOpenChange={(open) => {
        if (open && image) setValue(image.altText)
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Image description</DialogTitle>
          <DialogDescription>
            Describe the photo for people using a screen reader, and for search.
          </DialogDescription>
        </DialogHeader>
        {image && (
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist */}
            <img
              src={image.url}
              alt=""
              className="bg-muted size-20 shrink-0 rounded-md border object-cover"
            />
            <Input
              autoFocus
              value={value}
              maxLength={300}
              placeholder="Blue cotton panjabi, front view"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSave(value)
              }}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(value)}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Picks previously uploaded assets, so one photo can serve several products. */
function LibraryDialog({
  open,
  onOpenChange,
  alreadyChosen,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  alreadyChosen: Set<string>
  onPick: (images: ProductImageDraft[]) => void
}) {
  const [assets, setAssets] = useState<
    { id: string; url: string; altText: string | null }[] | null
  >(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function load() {
    setAssets(null)
    const rows = await listAvailableMediaAction()
    setAssets(
      rows.map((row) => ({ id: row.id, url: row.url, altText: row.altText }))
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setSelected(new Set())
          void load()
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>
            Images already uploaded to this workspace.
          </DialogDescription>
        </DialogHeader>

        {assets === null ? (
          <div className="text-muted-foreground flex justify-center py-10">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Nothing here yet — upload a photo and it will appear.
          </p>
        ) : (
          <ul className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
            {assets.map((asset) => {
              const used = alreadyChosen.has(asset.id)
              const picked = selected.has(asset.id)
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    disabled={used}
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(asset.id)) next.delete(asset.id)
                        else next.add(asset.id)
                        return next
                      })
                    }
                    className={cn(
                      'bg-muted relative aspect-square w-full overflow-hidden rounded-md border-2 transition',
                      picked ? 'border-primary' : 'border-transparent',
                      used && 'cursor-not-allowed opacity-35'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist */}
                    <img
                      src={asset.url}
                      alt={asset.altText ?? ''}
                      className="size-full object-cover"
                    />
                    {used && (
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] font-medium text-white">
                        added
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <X /> Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={() =>
              onPick(
                (assets ?? [])
                  .filter((asset) => selected.has(asset.id))
                  .map((asset) => ({
                    mediaId: asset.id,
                    url: asset.url,
                    altText: asset.altText ?? '',
                    position: 0,
                  }))
              )
            }
          >
            Add {selected.size > 0 ? selected.size : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
