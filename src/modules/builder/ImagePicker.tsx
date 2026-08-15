'use client'

import { useEffect, useRef, useState } from 'react'
import { Crop, ImagePlus, Loader2, UploadCloud } from 'lucide-react'
import { uploadMediaFile, type MediaAssetDTO } from '@/lib/media-upload'
import { listAvailableMediaAction } from './media-actions'
import { ImageCropper } from './ImageCropper'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export function ImagePicker({
  value,
  onChange,
  aspect,
}: {
  value: string
  onChange: (url: string) => void
  /**
   * The shape of the frame this image renders in, when the block fixes one.
   * Passed through to the cropper so the crop box matches what will actually
   * be visible on the page.
   */
  aspect?: number
}) {
  const [open, setOpen] = useState(false)
  const [cropping, setCropping] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div
          className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md border"
          // Previewed in the frame's own shape, so the thumbnail shows the
          // same crop the page will — the whole point of the control below.
          style={
            aspect ? { aspectRatio: String(aspect), height: 'auto' } : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied/CDN URLs aren't in next/image's remote allowlist */}
          <img src={value} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <div className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-md border">
          <ImagePlus className="size-5" />
        </div>
      )}
      <div className="flex flex-1 flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            {value ? 'Change image' : 'Choose image'}
          </Button>
          {value && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCropping(value)}
            >
              <Crop className="size-3.5" /> Crop
            </Button>
          )}
        </div>
        {value && (
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive text-xs"
            onClick={() => onChange('')}
          >
            Remove
          </button>
        )}
      </div>
      <ImagePickerDialog
        open={open}
        onOpenChange={setOpen}
        onSelect={(url) => {
          setOpen(false)
          // A newly chosen image goes straight to the cropper when the frame
          // has a fixed shape: that is the moment the merchant knows which
          // part matters, and the alternative is finding out on the published
          // page that the subject was cropped out.
          if (aspect) setCropping(url)
          else onChange(url)
        }}
      />
      <ImageCropper
        open={cropping !== null}
        src={cropping ?? ''}
        aspect={aspect}
        onOpenChange={(next) => {
          if (!next) {
            // Cancelling a crop still keeps the image that was just chosen —
            // "I don't want to crop" is not "I don't want this picture".
            if (cropping) onChange(cropping)
            setCropping(null)
          }
        }}
        onCropped={(url) => {
          onChange(url)
          setCropping(null)
        }}
      />
    </div>
  )
}

function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (url: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>
            Upload a new image or pick one already in your media library.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="upload">
          <TabsList>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <UploadTab onSelect={onSelect} />
          </TabsContent>
          <TabsContent value="library">
            <LibraryTab open={open} onSelect={onSelect} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function UploadTab({ onSelect }: { onSelect: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setDragOver] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const asset = await uploadMediaFile(file)
      onSelect(asset.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFile(e.dataTransfer.files[0])
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors',
          isDragOver && 'border-primary bg-accent'
        )}
      >
        {isUploading ? (
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        ) : (
          <UploadCloud className="text-muted-foreground size-6" />
        )}
        <p className="text-sm font-medium">Drag and drop an image, or</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? 'Uploading…' : 'Browse files'}
        </Button>
        <p className="text-muted-foreground text-xs">
          PNG, JPEG, WebP, or GIF — up to 10MB
        </p>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  )
}

function LibraryTab({
  open,
  onSelect,
}: {
  open: boolean
  onSelect: (url: string) => void
}) {
  const [assets, setAssets] = useState<MediaAssetDTO[] | null>(null)

  useEffect(() => {
    if (!open || assets !== null) return
    listAvailableMediaAction()
      .then(setAssets)
      .catch(() => setAssets([]))
  }, [open, assets])

  if (assets === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No images uploaded yet.
      </p>
    )
  }

  return (
    <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto py-2">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => onSelect(asset.url)}
          className="bg-muted hover:ring-ring aspect-square overflow-hidden rounded-md border transition-shadow hover:ring-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary CDN-hosted URLs */}
          <img
            src={asset.url}
            alt={asset.altText ?? ''}
            className="size-full object-cover"
          />
        </button>
      ))}
    </div>
  )
}
