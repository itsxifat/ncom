'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, UploadCloud } from 'lucide-react'
import { uploadMediaFile, type MediaAssetDTO } from '@/lib/media-upload'
import { listAvailableMediaAction } from './media-actions'
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
}: {
  value: string
  onChange: (url: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied/local-driver URLs aren't in next/image's remote allowlist */}
          <img src={value} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <div className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-md border">
          <ImagePlus className="size-5" />
        </div>
      )}
      <div className="flex flex-1 flex-col items-start gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          {value ? 'Change image' : 'Choose image'}
        </Button>
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
          onChange(url)
          setOpen(false)
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
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary local-driver/S3 URLs */}
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
