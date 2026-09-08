'use client'

import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FormSelect } from '@/components/ui/form-select'
import type { Corners, Sides, Shadow } from '../sections/elementStyle'

/**
 * The control vocabulary of the element design panel.
 *
 * One idea runs through all of it: **empty is a value**. Every control can be
 * in a third state beyond "on" and "off" — inheriting — and it has to be able
 * to say so, because that is the difference between "this headline is 32px"
 * and "this headline is whatever the block and theme make it". A control that
 * showed a resolved number in an empty box would pin every property a merchant
 * so much as looked at, and a page would slowly detach from its theme just by
 * being opened.
 *
 * So: placeholders read "Theme" or "—", never a computed value; clearing a box
 * writes `undefined`, which the store prunes; and a property that *is* set gets
 * a reset control next to its label, so going back is always one click.
 */

/** A labelled control, with a reset shown only when the property is set. */
export function Row({
  label,
  set,
  onReset,
  children,
  hint,
}: {
  label: string
  /** Whether this property carries a value at the breakpoint being edited. */
  set?: boolean
  onReset?: () => void
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-[11px] font-medium',
            set ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
        {set && onReset && (
          <button
            type="button"
            onClick={onReset}
            title="Reset to inherited"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
      </div>
      {children}
      {hint && (
        <span className="text-muted-foreground text-[10px]">{hint}</span>
      )}
    </div>
  )
}

export function Group({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="border-b pb-2 last:border-b-0">
      <summary className="text-muted-foreground cursor-pointer list-none py-2 text-[11px] font-semibold tracking-wide uppercase select-none">
        {title}
      </summary>
      <div className="flex flex-col gap-2.5 pt-1 pb-2">{children}</div>
    </details>
  )
}

export function NumberControl({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  placeholder = 'Theme',
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value.trim()
          onChange(raw === '' ? undefined : Number(raw))
        }}
        className="h-8 text-xs"
      />
      {suffix && (
        <span className="text-muted-foreground w-8 shrink-0 text-[10px]">
          {suffix}
        </span>
      )}
    </div>
  )
}

/**
 * A number paired with its unit.
 *
 * Lengths are stored as one string (`"320px"`, `"50%"`) rather than as a number
 * and a unit, because that is what the CSS grammar in `elementStyle.ts`
 * validates and what the stylesheet emits. Splitting them here and rejoining on
 * every keystroke keeps the editing model comfortable without giving the
 * storage format two fields that could disagree.
 */
const UNITS = ['px', '%', 'rem', 'vw', 'vh'] as const

export function LengthControl({
  value,
  onChange,
  placeholder = 'Auto',
  allowAuto = true,
}: {
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  allowAuto?: boolean
}) {
  const match = /^(-?[\d.]+)(px|%|rem|em|vw|vh)$/.exec(value ?? '')
  const amount = match?.[1] ?? ''
  const unit = match?.[2] ?? 'px'
  const isAuto = value === 'auto'

  function emit(nextAmount: string, nextUnit: string) {
    const trimmed = nextAmount.trim()
    onChange(trimmed === '' ? undefined : `${Number(trimmed)}${nextUnit}`)
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={isAuto ? '' : amount}
        placeholder={isAuto ? 'auto' : placeholder}
        onChange={(event) => emit(event.target.value, unit)}
        className="h-8 text-xs"
      />
      <FormSelect
        aria-label="Unit"
        value={isAuto ? 'auto' : unit}
        onChange={(event) => {
          const next = event.target.value
          if (next === 'auto') return onChange('auto')
          emit(amount || '0', next)
        }}
        className="border-input bg-card h-8 w-16 shrink-0 rounded-[0.625rem] border px-1 text-[11px]"
      >
        {UNITS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {allowAuto && <option value="auto">auto</option>}
      </FormSelect>
    </div>
  )
}

export function ColorControl({
  value,
  onChange,
  placeholder = 'Theme',
}: {
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="border-input relative size-8 shrink-0 overflow-hidden rounded-lg border">
        <span
          className="block size-full"
          // `backgroundColor` rather than the `background` shorthand: React
          // warns when a shorthand and its longhands are updated in the same
          // style object, because whichever is applied second silently wins.
          style={{
            backgroundColor: value || 'transparent',
            // A checkerboard behind the swatch, so "no colour set" is visibly
            // different from "set to white".
            backgroundImage: value
              ? undefined
              : 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)',
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 4px 4px',
          }}
        />
        <input
          type="color"
          aria-label="Colour"
          value={value ?? '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {/* The text field is the accessible path: a bare colour input cannot be
          typed into, pasted into, or read by a screen reader. */}
      <Input
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-8 text-xs"
      />
    </div>
  )
}

export function SelectControl<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Theme',
}: {
  value: T | undefined
  onChange: (value: T | undefined) => void
  options: readonly (T | { value: T; label: string })[]
  placeholder?: string
}) {
  return (
    <FormSelect
      value={value ?? ''}
      onChange={(event) =>
        onChange((event.target.value || undefined) as T | undefined)
      }
      className="border-input bg-card h-8 rounded-[0.625rem] border px-2 text-xs"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => {
        const optionValue = typeof option === 'string' ? option : option.value
        const optionLabel =
          typeof option === 'string'
            ? option.charAt(0).toUpperCase() +
              option.slice(1).replace(/-/g, ' ')
            : option.label
        return (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        )
      })}
    </FormSelect>
  )
}

export function ToggleControl({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  )
}

/**
 * Four sides, with a link toggle.
 *
 * Linked editing writes all four at once, which is what a merchant means nine
 * times in ten. It is a toggle rather than the only mode because the tenth time
 * — a card that needs breathing room on one side only — is exactly the case a
 * "padding" single field cannot express, and having to reach for custom CSS to
 * set one side would defeat the point of the panel.
 */
export function SidesControl({
  value,
  onChange,
  linked,
  onLinkedChange,
  min = -400,
  max = 400,
}: {
  value: Sides | undefined
  onChange: (value: Sides | undefined) => void
  linked: boolean
  onLinkedChange: (linked: boolean) => void
  min?: number
  max?: number
}) {
  const sides = value ?? {}

  function set(side: keyof Sides, raw: string) {
    const next = raw.trim() === '' ? undefined : Number(raw)
    const updated: Sides = linked
      ? { top: next, right: next, bottom: next, left: next }
      : { ...sides, [side]: next }
    const kept = Object.entries(updated).filter(([, v]) => v !== undefined)
    onChange(kept.length ? (Object.fromEntries(kept) as Sides) : undefined)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <div key={side} className="flex flex-col gap-0.5">
            <Input
              type="number"
              min={min}
              max={max}
              value={sides[side] ?? ''}
              placeholder="—"
              onChange={(event) => set(side, event.target.value)}
              className="h-8 px-1.5 text-center text-xs"
            />
            <span className="text-muted-foreground text-center text-[9px] capitalize">
              {side}
            </span>
          </div>
        ))}
      </div>
      <ToggleControl
        label="Link all sides"
        checked={linked}
        onChange={onLinkedChange}
      />
    </div>
  )
}

export function CornersControl({
  value,
  onChange,
  linked,
  onLinkedChange,
}: {
  value: Corners | undefined
  onChange: (value: Corners | undefined) => void
  linked: boolean
  onLinkedChange: (linked: boolean) => void
}) {
  const corners = value ?? {}
  const ORDER = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const
  const LABELS = ['TL', 'TR', 'BR', 'BL']

  function set(corner: keyof Corners, raw: string) {
    const next = raw.trim() === '' ? undefined : Number(raw)
    const updated: Corners = linked
      ? {
          topLeft: next,
          topRight: next,
          bottomRight: next,
          bottomLeft: next,
        }
      : { ...corners, [corner]: next }
    const kept = Object.entries(updated).filter(([, v]) => v !== undefined)
    onChange(kept.length ? (Object.fromEntries(kept) as Corners) : undefined)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1">
        {ORDER.map((corner, index) => (
          <div key={corner} className="flex flex-col gap-0.5">
            <Input
              type="number"
              min={0}
              max={999}
              value={corners[corner] ?? ''}
              placeholder="—"
              onChange={(event) => set(corner, event.target.value)}
              className="h-8 px-1.5 text-center text-xs"
            />
            <span className="text-muted-foreground text-center text-[9px]">
              {LABELS[index]}
            </span>
          </div>
        ))}
      </div>
      <ToggleControl
        label="Link all corners"
        checked={linked}
        onChange={onLinkedChange}
      />
    </div>
  )
}

export function ShadowControl({
  value,
  onChange,
  allowInset = true,
}: {
  value: Shadow | undefined
  onChange: (value: Shadow | undefined) => void
  allowInset?: boolean
}) {
  const shadow = value ?? {}

  function set(patch: Partial<Shadow>) {
    const next = { ...shadow, ...patch }
    // A shadow with no geometry paints nothing, so it is cleared outright
    // rather than stored as a set of zeroes that would read as "configured".
    const hasGeometry = [next.x, next.y, next.blur, next.spread].some(
      (component) => typeof component === 'number' && component !== 0
    )
    onChange(hasGeometry ? next : undefined)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1">
        {(['x', 'y', 'blur', 'spread'] as const).map((component) => (
          <div key={component} className="flex flex-col gap-0.5">
            <Input
              type="number"
              value={shadow[component] ?? ''}
              placeholder="0"
              onChange={(event) =>
                set({
                  [component]:
                    event.target.value === ''
                      ? undefined
                      : Number(event.target.value),
                })
              }
              className="h-8 px-1.5 text-center text-xs"
            />
            <span className="text-muted-foreground text-center text-[9px] capitalize">
              {component}
            </span>
          </div>
        ))}
      </div>
      <ColorControl
        value={shadow.color}
        onChange={(colour) => set({ color: colour })}
        placeholder="Black 25%"
      />
      {allowInset && (
        <ToggleControl
          label="Inside the element"
          checked={shadow.inset ?? false}
          onChange={(inset) => set({ inset: inset || undefined })}
        />
      )}
    </div>
  )
}
