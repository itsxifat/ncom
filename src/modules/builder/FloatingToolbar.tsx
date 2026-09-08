'use client'

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ClipboardPaste,
  Copy,
  Italic,
  Move,
  Trash2,
} from 'lucide-react'

import { useBuilderStore, styleBreakpoint } from './store'
import { parseElementKey, type CanvasRect } from './canvasBridge'
import { getSectionDefinition } from '../sections/registry'
import type { ElementStyle } from '../sections/elementStyle'
import { FONT_GROUPS } from '@/lib/fonts'
import { cn } from '@/lib/utils'

/**
 * The controls that sit on the selected element.
 *
 * A deliberately short list: the handful of things a merchant reaches for
 * without thinking — typeface, size, weight, colour, alignment — plus the three
 * actions that only make sense with something selected. Everything else lives
 * in the panel. A floating bar that grew to hold forty properties would cover
 * the design it is meant to be editing.
 *
 * Every control writes to the breakpoint currently being previewed, which is
 * what makes "switch to mobile, shrink the headline" work without a mode
 * switch: the frame the merchant is looking at *is* the mode.
 */
export function FloatingToolbar({
  rect,
  scale,
  label,
  index,
}: {
  rect: CanvasRect
  scale: number
  label: string
  /** Which instance was last clicked, for offering "just this one". */
  index?: number
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
  const hasClipboard = useBuilderStore((s) => s.styleClipboard !== null)

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
      className="bg-card absolute z-20 flex items-center gap-0.5 rounded-lg border p-1 shadow-lg"
      style={{ left: Math.max(0, rect.left * scale), top }}
      // The toolbar is over the canvas; a pointerdown reaching the drag layer
      // beneath it would start moving the element the moment a button is
      // pressed.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="text-muted-foreground max-w-28 truncate px-1.5 text-[11px] font-medium">
        {label}
      </span>
      <Divider />

      <select
        aria-label="Font"
        value={style.fontFamily ?? ''}
        onChange={(event) =>
          set({ fontFamily: event.target.value || undefined })
        }
        className="h-6 max-w-24 rounded bg-transparent px-1 text-[11px] outline-none"
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
      </select>

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
        className="border-input h-6 w-12 rounded border bg-transparent px-1 text-[11px] outline-none"
      />

      <ToolButton
        label="Bold"
        active={(style.fontWeight ?? 0) >= 600}
        onClick={() =>
          set({ fontWeight: (style.fontWeight ?? 0) >= 600 ? undefined : 700 })
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

      <label
        title="Text colour"
        className="hover:bg-accent relative flex size-6 cursor-pointer items-center justify-center rounded"
      >
        <span
          className="size-3.5 rounded-sm border"
          style={{ backgroundColor: style.color || 'transparent' }}
        />
        <input
          type="color"
          aria-label="Text colour"
          value={style.color ?? '#000000'}
          onChange={(event) => set({ color: event.target.value })}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

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
              set({ textAlign: style.textAlign === align ? undefined : align })
            }
          >
            <Icon className="size-3.5" />
          </ToolButton>
        )
      })}

      <Divider />

      <ToolButton
        label={
          style.position === 'absolute'
            ? 'Return to the layout'
            : 'Position freely'
        }
        active={style.position === 'absolute'}
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
      </ToolButton>

      <ToolButton
        label="Copy style"
        onClick={() => copyElementStyle(sectionId, elementKey)}
      >
        <Copy className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={hasClipboard ? 'Paste style' : 'Nothing copied yet'}
        disabled={!hasClipboard}
        onClick={() => pasteElementStyle(sectionId, elementKey)}
      >
        <ClipboardPaste className="size-3.5" />
      </ToolButton>

      {isExtra && (
        <ToolButton
          label="Delete element"
          onClick={() => removeExtraElement(sectionId, base.slice(2))}
        >
          <Trash2 className="size-3.5" />
        </ToolButton>
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
              'rounded px-1.5 py-1 text-[10px] font-medium',
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

      {/* Duplicating a built-in element produces an added copy carrying its
          style — the block only draws one of each, so there is nothing else a
          duplicate could be. */}
      {descriptor && !isExtra && duplicableAs(descriptor.kind) && (
        <ToolButton
          label="Duplicate"
          onClick={() =>
            duplicateElement(
              sectionId,
              elementKey,
              duplicableAs(descriptor.kind)!,
              definition?.slots?.[0]?.key ?? 'content'
            )
          }
        >
          <Copy className="size-3.5 rotate-180" />
        </ToolButton>
      )}
    </div>
  )
}

/** The added-element type a built-in element duplicates into, if any. */
function duplicableAs(
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
        'flex size-6 items-center justify-center rounded disabled:opacity-40',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
