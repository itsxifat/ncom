'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Crop, Loader2, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Crop and downscale an image in the browser, before it uploads.
 *
 * No external library: the strict CSP in next.config.ts blocks CDN scripts, so
 * the crop box is plain pointer maths and the export is a <canvas> draw.
 *
 * Two ways out. "Use original" uploads the file untouched; "Apply" exports the
 * selected region, downscaled so the long edge never exceeds MAX_EDGE — which
 * makes this a resize tool even when nothing is cropped, and is what keeps a
 * 12MP phone photo under the 10MB upload cap.
 */

/** Long-edge ceiling for the export. Well above any layout's needs. */
const MAX_EDGE = 1600

/** Corner handle hit area, in px. */
const HANDLE = 14

/** Smallest crop box, in displayed px. */
const MIN_BOX = 32

const ASPECTS = [
  { label: 'Free', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
] as const

/**
 * An animated GIF cannot survive a canvas round-trip — `drawImage` captures
 * one frame, so cropping would silently turn an animation into a still. Those
 * upload as-is rather than being quietly broken.
 */
export function isCroppable(file: File): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/gif'
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value))

/** A centred box of the given aspect that fits inside w×h. */
function centeredBox(w: number, h: number, aspect: number): Box {
  if (!aspect) return { x: 0, y: 0, w, h }
  let bw = w
  let bh = w / aspect
  if (bh > h) {
    bh = h
    bw = h * aspect
  }
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh }
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

interface DragState {
  mode: 'move' | 'resize'
  corner?: Corner
  startX: number
  startY: number
  box: Box
}

export function ImageCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File
  onCancel: () => void
  /** Receives the cropped file, or the original if "Use original" is used. */
  onDone: (file: File) => void | Promise<void>
}) {
  // Derived rather than set in an effect: creating it in state would render
  // once with no image and again with it, and recreating it inline on every
  // render would leak a blob URL per render.
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const imgRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)

  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [display, setDisplay] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState<Box | null>(null)
  const [aspect, setAspect] = useState<number>(0)
  const [busy, setBusy] = useState(false)

  function onImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    const iw = image.naturalWidth
    const ih = image.naturalHeight

    // Fit the image inside the stage so the crop maths works in displayed
    // pixels and is scaled back up to natural pixels only on export.
    const maxW = stageRef.current?.clientWidth || 460
    const maxH = 420
    const scale = Math.min(1, maxW / iw, maxH / ih)
    const d = { w: Math.round(iw * scale), h: Math.round(ih * scale) }

    setNatural({ w: iw, h: ih })
    setDisplay(d)
    setCrop({ x: 0, y: 0, w: d.w, h: d.h })
  }

  function applyAspect(value: number) {
    setAspect(value)
    setCrop(centeredBox(display.w, display.h, value))
  }

  function reset() {
    setAspect(0)
    setCrop({ x: 0, y: 0, w: display.w, h: display.h })
  }

  const onPointerDown =
    (mode: 'move' | 'resize', corner?: Corner) =>
    (event: React.PointerEvent<HTMLElement>) => {
      if (!crop) return
      event.preventDefault()
      event.stopPropagation()
      drag.current = {
        mode,
        corner,
        startX: event.clientX,
        startY: event.clientY,
        box: { ...crop },
      }
    }

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = drag.current
      if (!state) return

      const { mode, corner, startX, startY, box } = state
      const dx = event.clientX - startX
      const dy = event.clientY - startY

      if (mode === 'move') {
        setCrop({
          ...box,
          x: clamp(box.x + dx, 0, display.w - box.w),
          y: clamp(box.y + dy, 0, display.h - box.h),
        })
        return
      }

      // Resize from a corner: the opposite corner stays fixed.
      const right = box.x + box.w
      const bottom = box.y + box.h
      let nx = box.x
      let ny = box.y
      let nw = box.w
      let nh = box.h

      const movingLeft = corner === 'nw' || corner === 'sw'
      const movingTop = corner === 'nw' || corner === 'ne'

      if (movingLeft) {
        nx = clamp(box.x + dx, 0, right - MIN_BOX)
        nw = right - nx
      } else {
        nw = clamp(box.w + dx, MIN_BOX, display.w - box.x)
      }
      if (movingTop) {
        ny = clamp(box.y + dy, 0, bottom - MIN_BOX)
        nh = bottom - ny
      } else {
        nh = clamp(box.h + dy, MIN_BOX, display.h - box.y)
      }

      if (aspect) {
        // Keep the ratio by deriving height from width, then re-anchor if
        // that pushed the box off the top or past the bottom edge.
        nh = nw / aspect
        if (movingTop) ny = bottom - nh
        if (ny < 0 || nh > display.h) {
          nh = movingTop ? bottom : display.h - box.y
          nw = nh * aspect
          if (movingLeft) nx = right - nw
        }
      }

      setCrop({ x: nx, y: ny, w: nw, h: nh })
    },
    [aspect, display]
  )

  const onPointerUp = useCallback(() => {
    drag.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  async function apply() {
    const image = imgRef.current
    if (!crop || !natural.w || !image) return

    setBusy(true)
    try {
      const sx = (crop.x / display.w) * natural.w
      const sy = (crop.y / display.h) * natural.h
      const sw = (crop.w / display.w) * natural.w
      const sh = (crop.h / display.h) * natural.h

      let ow = sw
      let oh = sh
      const longEdge = Math.max(ow, oh)
      if (longEdge > MAX_EDGE) {
        const k = MAX_EDGE / longEdge
        ow *= k
        oh *= k
      }

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(ow))
      canvas.height = Math.max(1, Math.round(oh))

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not process image')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

      // PNG and WebP keep their format so transparency survives — exporting a
      // logo with an alpha channel as JPEG would fill it with black. Anything
      // else becomes JPEG, which is much smaller for photographs.
      const keepsAlpha = file.type === 'image/png' || file.type === 'image/webp'
      const mimeType = keepsAlpha ? file.type : 'image/jpeg'
      const extension = keepsAlpha
        ? file.type === 'image/png'
          ? 'png'
          : 'webp'
        : 'jpg'

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mimeType, 0.9)
      )
      if (!blob) throw new Error('Could not process image')

      const name = `${(file.name || 'image').replace(/\.[^.]+$/, '')}.${extension}`
      await onDone(new File([blob], name, { type: mimeType }))
    } finally {
      setBusy(false)
    }
  }

  const cornerStyle = (corner: Corner): React.CSSProperties => ({
    left: corner === 'nw' || corner === 'sw' ? -HANDLE / 2 : 'auto',
    right: corner === 'ne' || corner === 'se' ? -HANDLE / 2 : 'auto',
    top: corner === 'nw' || corner === 'ne' ? -HANDLE / 2 : 'auto',
    bottom: corner === 'sw' || corner === 'se' ? -HANDLE / 2 : 'auto',
    cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="size-4" />
            Crop &amp; resize
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5">
          {ASPECTS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => applyAspect(option.value)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                aspect === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 text-xs transition-colors"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        </div>

        <div
          ref={stageRef}
          className="bg-muted flex justify-center overflow-hidden rounded-lg select-none"
        >
          <div
            className="relative"
            style={{
              width: display.w || 'auto',
              height: display.h || 'auto',
              touchAction: 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the local file, not a remote asset */}
            <img
              ref={imgRef}
              src={url}
              alt=""
              onLoad={onImageLoad}
              draggable={false}
              className="block max-w-none"
              style={{
                width: display.w || 'auto',
                height: display.h || 'auto',
              }}
            />

            {crop && (
              <>
                {/* Four bands dim everything outside the selection. */}
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute bg-black/45"
                    style={{ left: 0, top: 0, width: '100%', height: crop.y }}
                  />
                  <div
                    className="absolute bg-black/45"
                    style={{
                      left: 0,
                      top: crop.y + crop.h,
                      width: '100%',
                      bottom: 0,
                    }}
                  />
                  <div
                    className="absolute bg-black/45"
                    style={{
                      left: 0,
                      top: crop.y,
                      width: crop.x,
                      height: crop.h,
                    }}
                  />
                  <div
                    className="absolute bg-black/45"
                    style={{
                      left: crop.x + crop.w,
                      top: crop.y,
                      right: 0,
                      height: crop.h,
                    }}
                  />
                </div>

                <div
                  className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: crop.w,
                    height: crop.h,
                    cursor: 'move',
                    touchAction: 'none',
                  }}
                  onPointerDown={onPointerDown('move')}
                >
                  {CORNERS.map((corner) => (
                    <span
                      key={corner}
                      onPointerDown={onPointerDown('resize', corner)}
                      className="border-primary absolute rounded-sm border bg-white"
                      style={{
                        width: HANDLE,
                        height: HANDLE,
                        ...cornerStyle(corner),
                        touchAction: 'none',
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <p className="text-muted-foreground text-center text-xs">
          Drag the box to crop. Large images are shrunk to {MAX_EDGE}px.
        </p>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onDone(file)}
            disabled={busy}
          >
            Use original
          </Button>
          <Button
            size="sm"
            onClick={() => void apply()}
            disabled={busy || !crop}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
