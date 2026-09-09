'use client'

import * as React from 'react'
import { Check, Pipette, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  CHECKERBOARD,
  formatHex,
  hsvaToHex,
  hsvaToRgba,
  isLightColor,
  parseColor,
  rgbaToHsva,
  type Hsva,
} from '@/lib/color'

/**
 * The editor's colour control.
 *
 * It replaces `<input type="color">` everywhere, and that is not a styling
 * preference. The native control hands the whole interaction to the operating
 * system: on a machine where that picker cannot open — no portal, a locked-down
 * desktop, a remote session — the input silently does nothing at all. There is
 * no event to hook, nothing to fall back to, and the merchant is left clicking
 * a swatch that never responds. Every control here is ours, so the only way it
 * can fail is a way we can see.
 *
 * Three things it must be able to say, which the native input cannot:
 *
 * - **Unset.** A colour nobody chose has to be distinguishable from black, or
 *   the design layer's inheritance model breaks the first time someone opens a
 *   popover to look. `null` is a value here, drawn as a checkerboard.
 * - **Transparency.** Alpha is a slider, and the stored value grows a hex byte
 *   rather than switching notation.
 * - **Where the colour came from.** Theme colours and recently used ones sit
 *   under the picker, because most colour choices on a page are "the same one
 *   as that", not a fresh point in colour space.
 */

const STORAGE_KEY = 'ncom:builder:recent-colors'
const MAX_RECENT = 18

/**
 * A neutral starting palette, for a page that has no theme colours to offer.
 *
 * Deliberately a ramp plus a few saturated hues rather than a designed set: it
 * is scaffolding for the first click, and anything more opinionated would make
 * every store built here look like it came from the same template.
 */
const DEFAULT_SWATCHES = [
  '#000000',
  '#374151',
  '#6b7280',
  '#d1d5db',
  '#f3f4f6',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
]

function loadRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is string =>
        typeof entry === 'string' && parseColor(entry) !== null
    )
  } catch {
    // Storage can throw outright in a private window or under an enterprise
    // policy. No recent colours is survivable; a picker that will not open is
    // not.
    return []
  }
}

function rememberColor(value: string) {
  try {
    const next = [value, ...loadRecent().filter((entry) => entry !== value)]
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(next.slice(0, MAX_RECENT))
    )
  } catch {
    // As above.
  }
}

// ── Swatch ────────────────────────────────────────────────────────────

/**
 * The square that shows a colour.
 *
 * The checkerboard is painted underneath rather than only when the colour is
 * unset, so a 20%-opacity red reads as translucent at a glance instead of
 * looking like a pale red somebody chose.
 */
export function ColorSwatch({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  return (
    <span
      className={cn(
        'border-input relative block overflow-hidden rounded-[5px] border',
        className
      )}
      style={{
        backgroundImage: CHECKERBOARD,
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 4px 4px',
      }}
    >
      <span
        className="absolute inset-0"
        style={{ backgroundColor: value || 'transparent' }}
      />
      {!value && (
        // A diagonal through an empty swatch is the one unambiguous way to say
        // "nothing set" — an empty checkerboard alone reads as fully
        // transparent, which is a colour a merchant may actually have chosen.
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to top right, transparent calc(50% - 0.5px), rgb(239 68 68) calc(50% - 0.5px), rgb(239 68 68) calc(50% + 0.5px), transparent calc(50% + 0.5px))',
          }}
        />
      )}
    </span>
  )
}

// ── Drag helper ───────────────────────────────────────────────────────

/**
 * Turns a pointer drag over an element into 0–1 coordinates within it.
 *
 * Pointer capture is what makes the drag continue past the edge of the plane,
 * which is how every colour picker behaves and how a merchant reaches pure
 * white without landing exactly on the corner pixel.
 */
type DragHandlers = Pick<
  React.ComponentProps<'div'>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp'
>

function useDragArea(
  onMove: (x: number, y: number) => void
): [React.RefObject<HTMLDivElement | null>, DragHandlers] {
  const ref = React.useRef<HTMLDivElement>(null)

  const report = React.useCallback(
    (clientX: number, clientY: number) => {
      const node = ref.current
      if (!node) return
      const box = node.getBoundingClientRect()
      if (!box.width || !box.height) return
      onMove(
        Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
        Math.min(1, Math.max(0, (clientY - box.top) / box.height))
      )
    },
    [onMove]
  )

  const handlers: DragHandlers = {
    onPointerDown(event) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      report(event.clientX, event.clientY)
    },
    onPointerMove(event) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      report(event.clientX, event.clientY)
    },
    onPointerUp(event) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
  }

  return [ref, handlers]
}

// ── Picker ────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  value: string | null | undefined
  onChange: (value: string | undefined) => void
  /** Colours worth one click — the page theme's, usually. */
  swatches?: string[]
  /** Whether the colour can be cleared back to inherited. */
  allowClear?: boolean
  /** Whether transparency can be chosen. Off for controls that cannot use it. */
  allowAlpha?: boolean
}

export function ColorPicker({
  value,
  onChange,
  swatches,
  allowClear = true,
  allowAlpha = true,
}: ColorPickerProps) {
  const parsed = parseColor(value)

  /**
   * Hue and saturation are kept here as well as in the value, because they are
   * not recoverable from it at the edges: every fully black colour is hue 0
   * saturation 0, so dragging the plane to the bottom would throw away the hue
   * the merchant had picked and the slider would jump back to red on the way
   * out.
   */
  const [draft, setDraft] = React.useState<Hsva>(() =>
    parsed ? rgbaToHsva(parsed) : { h: 0, s: 80, v: 90, a: 1 }
  )
  const [text, setText] = React.useState(value ?? '')
  const [recent, setRecent] = React.useState<string[]>([])

  // Browser-only, so it cannot be read during render without hydrating to
  // different markup than the server produced.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value
  React.useEffect(() => setRecent(loadRecent()), [])

  /**
   * An edit from somewhere else — a preset, a reset, a different element
   * selected — has to move the plane. An echo of our own write must not, or
   * every drag through a grey would snap the hue back.
   *
   * Adjusted during render rather than in an effect, which is React's own
   * answer for state that has to follow a prop: an effect would paint the stale
   * position first and correct it a frame later, and on a control being dragged
   * that reads as a stutter.
   */
  const [synced, setSynced] = React.useState(value)
  if (value !== synced) {
    setSynced(value)
    // Told apart from our own echo by asking what the plane currently spells
    // out: if the incoming value is that, nothing outside has changed.
    if (value !== hsvaToHex(draft)) {
      setText(value ?? '')
      const next = parseColor(value)
      if (next) setDraft(rgbaToHsva(next))
    }
  }

  const emit = React.useCallback(
    (next: Hsva) => {
      const hex = hsvaToHex(next)
      setDraft(next)
      setText(hex)
      onChange(hex)
    },
    [onChange]
  )

  const commit = React.useCallback(
    (hex: string) => {
      onChange(hex)
      rememberColor(hex)
      setRecent(loadRecent())
    },
    [onChange]
  )

  const [planeRef, planeDrag] = useDragArea((x, y) =>
    emit({ ...draft, s: x * 100, v: (1 - y) * 100 })
  )
  const [hueRef, hueDrag] = useDragArea((x) => emit({ ...draft, h: x * 360 }))
  const [alphaRef, alphaDrag] = useDragArea((x) => emit({ ...draft, a: x }))

  const current = hsvaToRgba(draft)
  const currentHex = formatHex(current)
  const opaqueHex = formatHex({ ...current, a: 1 })
  const palette = [...(swatches ?? []), ...DEFAULT_SWATCHES]
  // A colour offered twice is a colour a merchant has to look at twice to
  // notice it is the same one.
  const uniquePalette = Array.from(new Set(palette.map((c) => c.toLowerCase())))

  function applyTyped(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      if (allowClear) onChange(undefined)
      return
    }
    const rgba = parseColor(trimmed)
    if (!rgba) return
    const hex = formatHex(rgba)
    setDraft(rgbaToHsva(rgba))
    commit(hex)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        {...planeDrag}
        ref={planeRef}
        role="application"
        aria-label="Saturation and brightness"
        className="relative h-32 w-full cursor-crosshair touch-none rounded-md"
        style={{
          backgroundColor: `hsl(${draft.h} 100% 50%)`,
          backgroundImage:
            'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
        }}
      >
        <span
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
          style={{
            left: `${draft.s}%`,
            top: `${100 - draft.v}%`,
            backgroundColor: opaqueHex,
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Slider
            {...hueDrag}
            areaRef={hueRef}
            label="Hue"
            position={draft.h / 360}
            thumbColor={`hsl(${draft.h} 100% 50%)`}
            style={{
              backgroundImage:
                'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
          />
          {allowAlpha && (
            <Slider
              {...alphaDrag}
              areaRef={alphaRef}
              label="Opacity"
              position={draft.a}
              thumbColor={currentHex}
              style={{
                backgroundImage: `linear-gradient(to right, transparent, ${opaqueHex}), ${CHECKERBOARD}`,
                backgroundSize: 'auto, 8px 8px, 8px 8px',
                backgroundPosition: '0 0, 0 0, 4px 4px',
              }}
            />
          )}
        </div>
        <ColorSwatch value={value} className="size-9 shrink-0" />
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          value={text}
          spellCheck={false}
          aria-label="Colour value"
          placeholder={allowClear ? 'Inherited' : '#000000'}
          onChange={(event) => setText(event.target.value)}
          // Applied on blur and on Enter rather than per keystroke: `#ff` is a
          // legal prefix of `#ff0000` and repainting the page from every
          // half-typed hex makes the field impossible to edit.
          onBlur={(event) => applyTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              applyTyped(event.currentTarget.value)
            }
          }}
          className="h-8 font-mono text-xs"
        />
        <EyedropperButton onPick={(hex) => applyTyped(hex)} />
        {allowClear && (
          <button
            type="button"
            title="Clear — inherit again"
            aria-label="Clear colour"
            onClick={() => {
              setText('')
              onChange(undefined)
            }}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <SwatchRow
        label="Palette"
        colors={uniquePalette}
        selected={value}
        onPick={(hex) => {
          const rgba = parseColor(hex)
          if (rgba) setDraft(rgbaToHsva(rgba))
          setText(hex)
          commit(hex)
        }}
      />

      {recent.length > 0 && (
        <SwatchRow
          label="Recent"
          colors={recent}
          selected={value}
          onPick={(hex) => {
            const rgba = parseColor(hex)
            if (rgba) setDraft(rgbaToHsva(rgba))
            setText(hex)
            commit(hex)
          }}
        />
      )}
    </div>
  )
}

function Slider({
  areaRef,
  label,
  position,
  thumbColor,
  style,
  ...handlers
}: {
  areaRef: React.RefObject<HTMLDivElement | null>
  label: string
  /** 0–1 along the track. */
  position: number
  thumbColor: string
  style: React.CSSProperties
} & React.ComponentProps<'div'>) {
  return (
    <div
      {...handlers}
      ref={areaRef}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(position * 100)}
      className="relative h-3 w-full cursor-pointer touch-none rounded-full"
      style={style}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
        style={{ left: `${position * 100}%`, backgroundColor: thumbColor }}
      />
    </div>
  )
}

function SwatchRow({
  label,
  colors,
  selected,
  onPick,
}: {
  label: string
  colors: string[]
  selected: string | null | undefined
  onPick: (color: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
        {label}
      </span>
      <div className="grid grid-cols-9 gap-1">
        {colors.map((color) => {
          const active = selected?.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              onClick={() => onPick(color)}
              className="border-input relative aspect-square rounded-[5px] border"
              style={{ backgroundColor: color }}
            >
              {active && (
                <Check
                  className={cn(
                    'absolute inset-0 m-auto size-3',
                    isLightColor(color) ? 'text-black' : 'text-white'
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Picks a colour from anywhere on screen, where the browser offers it.
 *
 * Chromium-only today, so the button is absent rather than disabled elsewhere —
 * a permanently greyed-out control is a worse answer than no control.
 */
function EyedropperButton({ onPick }: { onPick: (hex: string) => void }) {
  const [supported, setSupported] = React.useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value
  React.useEffect(() => setSupported('EyeDropper' in window), [])
  if (!supported) return null

  return (
    <button
      type="button"
      title="Pick a colour from the screen"
      aria-label="Pick a colour from the screen"
      onClick={async () => {
        try {
          const Picker = (
            window as unknown as {
              EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> }
            }
          ).EyeDropper
          const result = await new Picker().open()
          if (result?.sRGBHex) onPick(result.sRGBHex)
        } catch {
          // The merchant pressed Escape. Nothing to report.
        }
      }}
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
    >
      <Pipette className="size-3.5" />
    </button>
  )
}

// ── Wrappers ──────────────────────────────────────────────────────────

/**
 * A swatch that opens the picker. The compact form, for toolbars.
 *
 * `z-[60]` on the popover, because the builder shell is a `z-50` overlay and a
 * popover that lands underneath it is a popover nobody can use.
 */
export function ColorSwatchButton({
  value,
  onChange,
  swatches,
  allowClear,
  allowAlpha,
  title,
  className,
  children,
}: ColorPickerProps & {
  title?: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        // `nativeButton` so the trigger is a real <button>: inside the floating
        // toolbar this sits among other buttons and has to tab like one.
        render={
          <button
            type="button"
            title={title}
            aria-label={title ?? 'Choose a colour'}
            className={cn(
              'hover:bg-accent flex size-7 items-center justify-center rounded-md',
              className
            )}
          />
        }
      >
        {children ?? <ColorSwatch value={value} className="size-4" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[60] w-64">
        <ColorPicker
          value={value}
          onChange={onChange}
          swatches={swatches}
          allowClear={allowClear}
          allowAlpha={allowAlpha}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The full row: a swatch that opens the picker, and the value as text.
 *
 * The text field is not decoration. It is the only path that can be typed
 * into, pasted into, read by a screen reader, or used to clear the value, and
 * on a machine where no picker of any kind can open it is the one that still
 * works.
 */
export function ColorField({
  id,
  value,
  onChange,
  swatches,
  allowClear = true,
  allowAlpha,
  placeholder,
  className,
}: ColorPickerProps & {
  /** Put on the text field, so a `<label htmlFor>` reaches the typed value. */
  id?: string
  placeholder?: string
  className?: string
}) {
  const [text, setText] = React.useState(value ?? '')
  // Follows the stored value during render — see the note in `ColorPicker`.
  const [synced, setSynced] = React.useState(value)
  if (value !== synced) {
    setSynced(value)
    setText(value ?? '')
  }

  function applyTyped(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      if (allowClear) onChange(undefined)
      else setText(value ?? '')
      return
    }
    const rgba = parseColor(trimmed)
    // A value we cannot parse is not written: it would fail `isColor` on the
    // way into the stylesheet and be dropped silently, which looks to the
    // merchant like the field forgot what they typed.
    if (!rgba) {
      setText(value ?? '')
      return
    }
    onChange(formatHex(rgba))
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Choose a colour"
              className="border-input hover:border-ring size-8 shrink-0 rounded-lg border p-0.5"
            />
          }
        >
          <ColorSwatch value={value} className="size-full rounded-[6px]" />
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[60] w-64">
          <ColorPicker
            value={value}
            onChange={onChange}
            swatches={swatches}
            allowClear={allowClear}
            allowAlpha={allowAlpha}
          />
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        value={text}
        spellCheck={false}
        placeholder={placeholder ?? (allowClear ? 'Theme' : '#000000')}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => applyTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            applyTyped(event.currentTarget.value)
          }
        }}
        className="h-8 font-mono text-xs"
      />
    </div>
  )
}
