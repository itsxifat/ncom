'use client'

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Italic,
  MoreHorizontal,
  Move,
  PaintBucket,
  RotateCcw,
  Trash2,
  Type,
  Underline,
} from 'lucide-react'

import { useBuilderStore, styleBreakpoint } from './store'
import { useThemeSwatches } from './themeSwatches'
import { parseElementKey, type CanvasElementInfo } from './canvasBridge'
import { getSectionDefinition } from '../sections/registry'
import type { ElementStyle } from '../sections/elementStyle'
import { FONT_GROUPS } from '@/lib/fonts'
import { FormSelect } from '@/components/ui/form-select'
import { ColorSwatchButton } from '@/components/ui/color-picker'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * The controls that sit on the selected element.
 *
 * A deliberately short list on its face: the handful of things a merchant
 * reaches for without thinking — typeface, size, weight, colour, alignment —
 * with everything rarer folded behind one overflow menu. A bar that grew to
 * hold forty properties would cover the design it is meant to be editing, and
 * the panel on the right is where forty properties belong.
 *
 * Every control writes to the breakpoint currently being previewed, which is
 * what makes "switch to mobile, shrink the headline" work without a mode
 * switch: the frame the merchant is looking at *is* the mode.
 *
 * Nothing here is a native form control. A native `<select>` hands its option
 * list to the operating system, which knows nothing about this page's theme and
 * paints it as light-on-white; `<input type="color">` hands the whole
 * interaction over and, on a machine where that picker cannot open, silently
 * does nothing at all. Both are replaced by components we own — see
 * `components/ui/form-select.tsx` and `components/ui/color-picker.tsx`.
 */
export function FloatingToolbar({
  element,
  index,
  scale,
  label,
  onSelectParent,
}: {
  /** The selected element's geometry, as the canvas last reported it. */
  element: CanvasElementInfo
  /** Which instance was last clicked, for offering "just this one". */
  index?: number
  scale: number
  label: string
  /** Steps the selection out to the element that contains this one. */
  onSelectParent?: () => void
}) {
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const sectionId = useBuilderStore((s) => s.selectedSectionId)
  const elementKey = useBuilderStore((s) => s.selectedElementKey)
  const sections = useBuilderStore((s) => s.sections)
  const setElementStyle = useBuilderStore((s) => s.setElementStyle)
  const selectElement = useBuilderStore((s) => s.selectElement)
  const copyElementStyle = useBuilderStore((s) => s.copyElementStyle)
  const pasteElementStyle = useBuilderStore((s) => s.pasteElementStyle)
  const duplicateElement = useBuilderStore((s) => s.duplicateElement)
  const removeExtraElement = useBuilderStore((s) => s.removeExtraElement)
  const resetElement = useBuilderStore((s) => s.resetElement)
  const hasClipboard = useBuilderStore((s) => s.styleClipboard !== null)
  const swatches = useThemeSwatches()

  const rect = element.rect

  if (!sectionId || !elementKey) return null

  const bp = styleBreakpoint(breakpoint)
  const section = sections.find((s) => s.id === sectionId)
  const style: ElementStyle =
    section?.config?.elements?.[elementKey]?.[bp] ?? {}
  const { base } = parseElementKey(elementKey)
  const isExtra = base.startsWith('x:')

  const definition = section ? getSectionDefinition(section.type) : undefined
  const descriptor = definition?.elements.find((el) => el.key === base)
  const repeated = Boolean(descriptor?.repeated) && index !== undefined
  const scoped = elementKey.includes('#')
  const textual =
    !descriptor ||
    ['text', 'heading', 'button', 'container'].includes(descriptor.kind)

  function set(patch: Partial<ElementStyle>) {
    setElementStyle(sectionId!, elementKey!, bp, patch)
  }

  // Above the element when there is room, below it when the element is at the
  // top of the frame — a toolbar clipped by the canvas gutter is a toolbar with
  // half its buttons unreachable.
  const above = rect.top * scale > 46
  const top = above
    ? rect.top * scale - 42
    : (rect.top + rect.height) * scale + 8

  return (
    <div
      className="bg-card absolute z-20 flex items-center gap-0.5 rounded-xl border p-1 shadow-lg"
      style={{ left: Math.max(0, rect.left * scale), top }}
      // The toolbar is over the canvas; a pointerdown reaching the drag layer
      // beneath it would start moving the element the moment a button is
      // pressed.
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onSelectParent && (
        <ToolButton
          label="Select what contains this (Esc)"
          onClick={onSelectParent}
        >
          <ChevronUp className="size-3.5" />
        </ToolButton>
      )}
      <span className="text-muted-foreground max-w-28 truncate px-1.5 text-[11px] font-medium">
        {label}
      </span>
      <Divider />

      {textual && (
        <>
          <FormSelect
            aria-label="Font"
            size="sm"
            value={style.fontFamily ?? ''}
            onChange={(event) =>
              set({ fontFamily: event.target.value || undefined })
            }
            className="h-7 w-28 rounded-md px-1.5 text-[11px]"
          >
            <option value="">Theme font</option>
            {FONT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.fonts.map((font) => (
                  <option key={font.name} value={font.name}>
                    {font.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </FormSelect>

          <input
            type="number"
            aria-label="Font size"
            min={8}
            max={200}
            // Empty rather than a guessed number: the box has to be able to say
            // "inheriting" as distinct from "16px", or a merchant who opens the
            // toolbar to look at a headline leaves having pinned its size.
            value={style.fontSize ?? ''}
            placeholder="—"
            onChange={(event) =>
              set({
                fontSize: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
            className="border-input bg-card h-7 w-12 rounded-md border px-1.5 text-[11px] outline-none"
          />

          <ToolButton
            label="Bold"
            active={(style.fontWeight ?? 0) >= 600}
            onClick={() =>
              set({
                fontWeight: (style.fontWeight ?? 0) >= 600 ? undefined : 700,
              })
            }
          >
            <Bold className="size-3.5" />
          </ToolButton>
          <ToolButton
            label="Italic"
            active={style.fontStyle === 'italic'}
            onClick={() =>
              set({
                fontStyle: style.fontStyle === 'italic' ? undefined : 'italic',
              })
            }
          >
            <Italic className="size-3.5" />
          </ToolButton>
          <ToolButton
            label="Underline"
            active={style.textDecoration === 'underline'}
            onClick={() =>
              set({
                textDecoration:
                  style.textDecoration === 'underline'
                    ? undefined
                    : 'underline',
              })
            }
          >
            <Underline className="size-3.5" />
          </ToolButton>

          <ColorSwatchButton
            title="Text colour"
            value={style.color}
            swatches={swatches}
            onChange={(color) => set({ color })}
          >
            <span className="relative flex flex-col items-center">
              <Type className="size-3" />
              <span
                className="mt-px h-1 w-3.5 rounded-[1px]"
                style={{ backgroundColor: style.color || 'currentColor' }}
              />
            </span>
          </ColorSwatchButton>
        </>
      )}

      <ColorSwatchButton
        title="Background colour"
        value={style.backgroundColor}
        swatches={swatches}
        onChange={(backgroundColor) => set({ backgroundColor })}
      >
        <span className="relative flex flex-col items-center">
          <PaintBucket className="size-3" />
          <span
            className="mt-px h-1 w-3.5 rounded-[1px]"
            style={{ backgroundColor: style.backgroundColor || 'currentColor' }}
          />
        </span>
      </ColorSwatchButton>

      {textual && (
        <>
          <Divider />
          {(['left', 'center', 'right'] as const).map((align) => {
            const Icon =
              align === 'left'
                ? AlignLeft
                : align === 'center'
                  ? AlignCenter
                  : AlignRight
            return (
              <ToolButton
                key={align}
                label={`Align ${align}`}
                active={style.textAlign === align}
                onClick={() =>
                  set({
                    textAlign: style.textAlign === align ? undefined : align,
                  })
                }
              >
                <Icon className="size-3.5" />
              </ToolButton>
            )
          })}
        </>
      )}

      {repeated && (
        <>
          <Divider />
          <button
            type="button"
            onClick={() =>
              selectElement(sectionId, scoped ? base : `${base}#${index}`)
            }
            className={cn(
              'rounded-md px-1.5 py-1 text-[10px] font-medium',
              scoped
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
            title={
              scoped
                ? 'Editing this one only — click to style all of them'
                : 'Editing all of them — click to style just this one'
            }
          >
            {scoped ? `#${index! + 1} only` : 'All'}
          </button>
        </>
      )}

      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              title="More"
              aria-label="More element actions"
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-md"
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() =>
              set(
                style.position === 'absolute'
                  ? // Coming back into the flow clears the coordinates too. Left
                    // behind, they would apply again — invisibly — the next time
                    // free positioning was switched on.
                    {
                      position: undefined,
                      top: undefined,
                      left: undefined,
                      right: undefined,
                      bottom: undefined,
                    }
                  : {
                      position: 'absolute',
                      left: `${Math.round(rect.left)}px`,
                      top: `${Math.round(rect.top)}px`,
                      width: `${Math.round(rect.width)}px`,
                    }
              )
            }
          >
            <Move className="size-3.5" />
            {style.position === 'absolute'
              ? 'Return to the layout'
              : 'Position freely'}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => copyElementStyle(sectionId, elementKey)}
          >
            <Copy className="size-3.5" />
            Copy style
            <DropdownMenuShortcut>⌘⌥C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasClipboard}
            onClick={() => pasteElementStyle(sectionId, elementKey)}
          >
            <ClipboardPaste className="size-3.5" />
            Paste style
            <DropdownMenuShortcut>⌘⌥V</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => resetElement(sectionId, elementKey)}>
            <RotateCcw className="size-3.5" />
            Reset every style
          </DropdownMenuItem>

          {/* Duplicating a built-in element produces an added copy carrying its
              style — the block only draws one of each, so there is nothing else
              a duplicate could be. */}
          {descriptor && !isExtra && duplicableAs(descriptor.kind) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  duplicateElement(
                    sectionId,
                    elementKey,
                    duplicableAs(descriptor.kind)!,
                    definition?.slots?.[0]?.key ?? 'content'
                  )
                }
              >
                <CopyPlus className="size-3.5" />
                Duplicate as a new element
                <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}

          {isExtra && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => removeExtraElement(sectionId, base.slice(2))}
              >
                <Trash2 className="size-3.5" />
                Delete element
                <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The added-element type a built-in element duplicates into, if any. */
export function duplicableAs(
  kind: string
): 'heading' | 'text' | 'button' | 'image' | 'icon' | 'divider' | null {
  switch (kind) {
    case 'heading':
      return 'heading'
    case 'text':
      return 'text'
    case 'button':
      return 'button'
    case 'image':
      return 'image'
    case 'icon':
      return 'icon'
    case 'divider':
      return 'divider'
    default:
      // A container has children the copy would not have, and a spacer is
      // cheaper to add than to duplicate.
      return null
  }
}

function Divider() {
  return <span className="bg-border mx-0.5 h-4 w-px" />
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md disabled:opacity-40',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
