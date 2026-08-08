'use client'

import { useRef, useState, useTransition } from 'react'
import { Loader2, Trash2, UploadCloud, RefreshCw, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { uploadMediaFile, replaceMediaFile } from '@/lib/media-upload'
import { updateAltTextAction, deleteMediaAssetAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { listMediaAssets } from '@/server/services/mediaService'

type MediaAsset = Awaited<ReturnType<typeof listMediaAssets>>[number]

export function MediaLibraryClient({
  projectId,
  initialAssets,
}: {
  projectId: string
  initialAssets: MediaAsset[]
}) {
  const [assets, setAssets] = useState(initialAssets)
  const [isUploading, setUploading] = useState(false)
  const [isDragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const asset = await uploadMediaFile(file, { projectId })
      setAssets((prev) => [asset as MediaAsset, ...prev])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleUpload(e.dataTransfer.files[0])
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
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files?.[0])}
        />
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No images uploaded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => (
            <MediaCard
              key={asset.id}
              projectId={projectId}
              asset={asset}
              onReplaced={(updated) =>
                setAssets((prev) =>
                  prev.map((a) => (a.id === updated.id ? updated : a))
                )
              }
              onDeleted={() =>
                setAssets((prev) => prev.filter((a) => a.id !== asset.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MediaCard({
  projectId,
  asset,
  onReplaced,
  onDeleted,
}: {
  projectId: string
  asset: MediaAsset
  onReplaced: (asset: MediaAsset) => void
  onDeleted: () => void
}) {
  const [altText, setAltText] = useState(asset.altText ?? '')
  const [isPending, startTransition] = useTransition()
  const [isReplacing, setReplacing] = useState(false)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  function saveAltText() {
    startTransition(() => {
      updateAltTextAction(projectId, asset.id, altText)
    })
  }

  async function handleReplace(file: File | undefined) {
    if (!file) return
    setReplacing(true)
    try {
      const updated = await replaceMediaFile(asset.id, file)
      onReplaced({ ...asset, ...updated } as MediaAsset)
      toast.success('Image replaced')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Replace failed')
    } finally {
      setReplacing(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-muted aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary local-driver/S3 URLs */}
        <img
          src={asset.url}
          alt={asset.altText ?? ''}
          className="size-full object-cover"
        />
      </div>
      <CardContent className="flex flex-col gap-2 p-3">
        <p className="truncate text-xs font-medium" title={asset.fileName}>
          {asset.fileName}
        </p>
        <Input
          value={altText}
          placeholder="Alt text"
          onChange={(e) => setAltText(e.target.value)}
          onBlur={saveAltText}
          className="h-7 text-xs"
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Copy URL"
            onClick={() => {
              navigator.clipboard.writeText(asset.url)
              toast.success('URL copied')
            }}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Replace"
            disabled={isReplacing}
            onClick={() => replaceInputRef.current?.click()}
          >
            {isReplacing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Delete"
            className="text-destructive ml-auto"
            disabled={isPending}
            onClick={() => {
              if (
                !window.confirm(
                  'Delete this image? It may still be used on a page.'
                )
              ) {
                return
              }
              startTransition(() => {
                deleteMediaAssetAction(projectId, asset.id)
              })
              onDeleted()
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void handleReplace(e.target.files?.[0])}
        />
      </CardContent>
    </Card>
  )
}
