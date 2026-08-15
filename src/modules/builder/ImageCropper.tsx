'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { cropMediaAction } from './media-actions'

/** A crop region in fractions of the source image — the shape the server takes. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The ratios offered when the frame this image lands in is not a fixed shape.
 *
 * `null` means free-form. Kept short on purpose: these are the shapes the block
 * library actually renders, and a list of twenty ratios is a worse answer to
 * "which part do I want to show" than four and a drag handle.
 */
const RATIO_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
]

const WHOLE_IMAGE: CropRect = { x: 0, y: 0, width: 1, height: 1 }

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * The largest rect of a given aspect that fits inside the image, centred.
 *
 * Expressed in fractions of the image, which is why the aspect has to be
 * converted through `imageAspect`: a 1:1 crop of a 3:4 photograph is not
 * `{width: 1, height: 1}` in fraction space — it is the full width and
 * three-quarters of the height.
 */
function centeredRect(aspect: number | null, imageAspect: number): CropRect {
  if (!aspect) return WHOLE_IMAGE

  // ratio > 1 means the wanted shape is wider than the image, so width binds.
  const ratio = aspect / imageAspect
  const width = ratio >= 1 ? 1 : ratio
  const height = ratio >= 1 ? 1 / ratio : 1
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

type DragMode =
  | { kind: 'move'; startX: number; startY: number }
  | { kind: 'resize'; corner: Corner; origin: CropRect }

const CORNERS: { corner: Corner; className: string; cursor: string }[] = [
  { corner: 'nw', className: '-top-1 -left-1', cursor: 'nwse-resize' },
  { corner: 'ne', className: '-top-1 -right-1', cursor: 'nesw-resize' },
  { corner: 'sw', className: '-bottom-1 -left-1', cursor: 'nesw-resize' },
  { corner: 'se', className: '-bottom-1 -right-1', cursor: 'nwse-resize' },
]

/**
 * Chooses which part of an image is kept when it has to fill a frame of a
 * different shape.
 *
 * The problem this solves: a block renders its image with `object-cover` into a
 * fixed aspect box, so a 3:4 photograph dropped into a 1:1 frame gets its top
 * and bottom silently cut off around the centre. That is almost never where the
 * subject is. This lets the merchant say where it is, once, and stores the
 * answer as a real cropped image rather than as a positioning hint every
 * renderer would then have to honour.
 *
 * The crop box is dragged over a scaled preview and reported in fractions, so
 * nothing here needs to know the image's true pixel size — the server does the
 * cut at full resolution.
 */
export function ImageCropper({
  open,
  src,
  aspect,
  onOpenChange,
  onCropped,
}: {
  open: boolean
  src: string
  /**
   * The shape of the frame this image will render in, when it is fixed. Locks
   * the crop box to that ratio and hides the preset row — offering "16:9" for a
   * slot that renders a square is offering a wrong answer.
   */
  aspect?: number
  onOpenChange: (open: boolean) => void
  onCropped: (url: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose what to show</DialogTitle>
          <DialogDescription>
            Drag the box to pick the part of this image that stays visible.
            {aspect
              ? ' It is locked to the shape of the frame this image renders in.'
              : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Keyed on the image and mounted only while open, so every session
            starts from a clean crop instead of inheriting the last one. That
            reset is what would otherwise need an effect. */}
        {open && (
          <CropEditor
            key={`${src}:${aspect ?? 'free'}`}
            src={src}
            aspect={aspect}
            onCancel={() => onOpenChange(false)}
            onCropped={onCropped}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CropEditor({
  src,
  aspect,
  onCancel,
  onCropped,
}: {
  src: string
  aspect?: number
  onCancel: () => void
  onCropped: (url: string) => void
}) {
  const [ratio, setRatio] = useState<number | null>(aspect ?? null)
  const [imageAspect, setImageAspect] = useState<number | null>(null)
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * The dragged rect, or null to mean "wherever the current ratio centres".
   *
   * Keeping "untouched" as null rather than eagerly storing a rect is what
   * lets the box re-fit itself when the image loads or the ratio changes,
   * without an effect that writes state on every such change.
   */
  const [dragged, setDragged] = useState<CropRect | null>(null)
  const rect =
    dragged ??
    (imageAspect === null ? WHOLE_IMAGE : centeredRect(ratio, imageAspect))

  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode | null>(null)

  const onPointerDown = useCallback(
    (event: React.PointerEvent, mode: DragMode) => {
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = mode
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    },
    []
  )

  useEffect(() => {
    function pointerMove(event: PointerEvent) {
      const drag = dragRef.current
      const frame = frameRef.current
      if (!drag || !frame) return

      const bounds = frame.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return

      // Pointer position in the same fraction space the rect is stored in.
      const px = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
      const py = clamp((event.clientY - bounds.top) / bounds.height, 0, 1)

      if (drag.kind === 'move') {
        // Updated from the previous value rather than from a rect captured
        // when the listener was bound, so a drag tracks the box as it moves.
        setDragged((previous) => {
          const { width, height } =
            previous ??
            (imageAspect === null
              ? WHOLE_IMAGE
              : centeredRect(ratio, imageAspect))
          return {
            x: clamp(px - drag.startX, 0, 1 - width),
            y: clamp(py - drag.startY, 0, 1 - height),
            width,
            height,
          }
        })
        return
      }

      // Resize works from the corner diagonally opposite the one being
      // dragged, which stays pinned.
      const origin = drag.origin
      const anchorX =
        drag.corner === 'nw' || drag.corner === 'sw'
          ? origin.x + origin.width
          : origin.x
      const anchorY =
        drag.corner === 'nw' || drag.corner === 'ne'
          ? origin.y + origin.height
          : origin.y

      // The wanted shape, converted from screen aspect into fraction space.
      const shape = ratio && imageAspect ? ratio / imageAspect : null

      let width = Math.abs(px - anchorX)
      let height = Math.abs(py - anchorY)

      if (shape) {
        // Driven by whichever axis the pointer pushed further, so dragging
        // follows the cursor rather than one fixed axis.
        if (width / shape > height) height = width / shape
        else width = height * shape
      }

      // Keep the box inside the image by shrinking it, never by letting it
      // escape — with a locked ratio both axes have to give at once.
      const maxWidth = px >= anchorX ? 1 - anchorX : anchorX
      const maxHeight = py >= anchorY ? 1 - anchorY : anchorY
      if (width > maxWidth) {
        width = maxWidth
        if (shape) height = width / shape
      }
      if (height > maxHeight) {
        height = maxHeight
        if (shape) width = height * shape
      }

      const minimum = 0.05
      if (width < minimum || height < minimum) return

      setDragged({
        x: px >= anchorX ? anchorX : anchorX - width,
        y: py >= anchorY ? anchorY : anchorY - height,
        width,
        height,
      })
    }

    function pointerUp() {
      dragRef.current = null
    }

    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    return () => {
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
    }
  }, [ratio, imageAspect])

  async function save() {
    setSaving(true)
    setError(null)
    const result = await cropMediaAction(src, rect)
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
      return
    }
    onCropped(result.url)
  }

  const isWholeImage =
    rect.x === 0 && rect.y === 0 && rect.width === 1 && rect.height === 1

  return (
    <>
      {!aspect && (
        <div className="flex flex-wrap gap-1.5">
          {RATIO_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={ratio === preset.value ? 'default' : 'outline'}
              onClick={() => {
                setRatio(preset.value)
                // Back to "untouched", so the box re-centres in the new shape.
                setDragged(null)
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      <div className="bg-muted flex max-h-[55vh] justify-center overflow-hidden rounded-lg p-2">
        <div ref={frameRef} className="relative select-none">
          {/* eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist */}
          <img
            src={src}
            alt=""
            draggable={false}
            className="max-h-[50vh] w-auto max-w-full object-contain"
            onLoad={(event) => {
              const img = event.currentTarget
              if (img.naturalWidth && img.naturalHeight) {
                setImageAspect(img.naturalWidth / img.naturalHeight)
              }
            }}
          />

          {imageAspect !== null && (
            <>
              {/* Dim everything outside the box. A single overlay with the
                  crop punched out keeps the shading even; four strips would
                  double up at the corners. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-black/50"
                style={{
                  clipPath: `polygon(0% 0%, 0% 100%, ${rect.x * 100}% 100%, ${rect.x * 100}% ${rect.y * 100}%, ${(rect.x + rect.width) * 100}% ${rect.y * 100}%, ${(rect.x + rect.width) * 100}% ${(rect.y + rect.height) * 100}%, ${rect.x * 100}% ${(rect.y + rect.height) * 100}%, ${rect.x * 100}% 100%, 100% 100%, 100% 0%)`,
                }}
              />

              <div
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
                onPointerDown={(event) => {
                  const frame = frameRef.current
                  if (!frame) return
                  const bounds = frame.getBoundingClientRect()
                  onPointerDown(event, {
                    kind: 'move',
                    // Where in the box the grab happened, so it does not jump
                    // its own top-left corner to the cursor.
                    startX:
                      (event.clientX - bounds.left) / bounds.width - rect.x,
                    startY:
                      (event.clientY - bounds.top) / bounds.height - rect.y,
                  })
                }}
              >
                {CORNERS.map(({ corner, className, cursor }) => (
                  <span
                    key={corner}
                    style={{ cursor }}
                    className={cn(
                      'absolute size-3 rounded-full border border-black/30 bg-white',
                      className
                    )}
                    onPointerDown={(event) =>
                      onPointerDown(event, {
                        kind: 'resize',
                        corner,
                        origin: rect,
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={isSaving || imageAspect === null || isWholeImage}
        >
          {isSaving && <Loader2 className="size-3.5 animate-spin" />}
          {isSaving ? 'Cropping…' : 'Use this crop'}
        </Button>
      </div>
    </>
  )
}
