'use client'

import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react'
import { getSectionDefinition, sectionRegistry } from '../sections/registry'
import type { SectionDefinition } from '../sections/registry'
import { isLayoutSection, useBuilderStore } from './store'
import {
  canDuplicate,
  canRemove,
  canSaveAsBlock,
  type PageContext,
} from './rules'
import { BlockLibrary, newSection, useBuilderLanguage } from './BlockLibrary'
import { insertSavedBlock, openSaveBlock } from './SavedBlocks'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SectionRect {
  id: string
  top: number
  height: number
}

/**
 * The toolbar and "+" buttons over a section on the canvas.
 *
 * What a non-technical merchant reaches for first is not a panel but the thing
 * itself: "move this up", "delete this", "put something here". So the section
 * under the pointer gets its name and those actions right on it, and a "+" on
 * its top and bottom edges that opens the block library exactly there.
 *
 * Drawn in the editor's own layer over the scaled frame, like every other
 * piece of canvas chrome, so a merchant's styles can never reach it.
 */
export function SectionChrome({
  rect,
  index,
  scale,
  width,
  context,
  selected,
}: {
  rect: SectionRect
  /** The section's position in the builder's list. */
  index: number
  scale: number
  /** The frame's width in canvas pixels. */
  width: number
  context: PageContext | null
  selected: boolean
}) {
  const section = useBuilderStore((s) =>
    s.sections.find((c) => c.id === rect.id)
  )
  const sections = useBuilderStore((s) => s.sections)
  const selectSection = useBuilderStore((s) => s.selectSection)
  const moveSection = useBuilderStore((s) => s.moveSection)
  const duplicateSection = useBuilderStore((s) => s.duplicateSection)
  const removeSection = useBuilderStore((s) => s.removeSection)
  const toggleSectionVisibility = useBuilderStore(
    (s) => s.toggleSectionVisibility
  )

  if (!section) return null
  const definition = getSectionDefinition(section.type)
  const layout = isLayoutSection(section)
  const removable = canRemove(section, context)

  const pageStart = sections.findIndex((s) => !isLayoutSection(s))
  const pageEnd =
    sections.length -
    [...sections].reverse().findIndex((s) => !isLayoutSection(s))
  const first = index <= pageStart
  const last = index >= pageEnd - 1

  const top = rect.top * scale
  const height = rect.height * scale

  // A section scrolled entirely out of the frame keeps no chrome on screen.
  if (top + height < 0) return null

  const placement = layout
    ? getSectionDefinition(section.type)?.placement
    : null

  return (
    <>
      <div
        className={cn(
          'pointer-events-none absolute left-0 rounded-[2px] border-2',
          selected ? 'border-primary' : 'border-primary/40 border-dashed'
        )}
        style={{ top, height, width: width * scale }}
      />

      <div
        className="pointer-events-auto absolute flex items-center gap-0.5 rounded-lg bg-neutral-900 p-0.5 text-white shadow-lg"
        style={{ top: Math.max(top, 0) + 8, right: 8 }}
      >
        <button
          type="button"
          onClick={() => selectSection(section.id)}
          className="max-w-40 truncate px-2 text-xs font-semibold"
          title="Edit this block"
        >
          {definition?.name ?? section.type}
          {layout && (
            <span className="ml-1 font-normal text-white/60">· every page</span>
          )}
        </button>
        {!layout && (
          <>
            <ToolbarButton
              title="Move up"
              disabled={first}
              onClick={() => moveSection(section.id, -1)}
            >
              <ArrowUp className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Move down"
              disabled={last}
              onClick={() => moveSection(section.id, 1)}
            >
              <ArrowDown className="size-3.5" />
            </ToolbarButton>
          </>
        )}
        {canDuplicate(section) && (
          <ToolbarButton
            title="Duplicate"
            onClick={() => duplicateSection(section.id)}
          >
            <Copy className="size-3.5" />
          </ToolbarButton>
        )}
        {canSaveAsBlock(section) && (
          <ToolbarButton
            title="Save as a reusable block"
            onClick={() => openSaveBlock(section)}
          >
            <BookmarkPlus className="size-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton
          title={section.isVisible ? 'Hide' : 'Show'}
          onClick={() => toggleSectionVisibility(section.id)}
        >
          {section.isVisible ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
        </ToolbarButton>
        <ToolbarButton
          title={removable.ok ? 'Delete' : removable.reason}
          disabled={!removable.ok}
          onClick={() => removeSection(section.id)}
        >
          <Trash2 className="size-3.5" />
        </ToolbarButton>
      </div>

      {/* Insert above — never above the header or the announcement bar. */}
      {!layout && <InsertButton top={top} width={width * scale} at={index} />}
      {/* Insert below — under the header means at the top of the page. */}
      {placement !== 'bottom' && (
        <InsertButton top={top + height} width={width * scale} at={index + 1} />
      )}
    </>
  )
}

function ToolbarButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title?: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md transition hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function InsertButton({
  top,
  width,
  at,
}: {
  top: number
  width: number
  at: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Add a block here"
            aria-label="Add a block here"
            className="bg-primary text-primary-foreground pointer-events-auto absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-md ring-2 ring-white transition hover:scale-110"
            style={{ top, left: width / 2 }}
          />
        }
      >
        <Plus className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="max-h-[70vh] w-[26rem] overflow-y-auto p-3">
        <BlockLibrary compact insertAt={at} onPicked={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Catches a block dragged from the library over the canvas.
 *
 * Laid over the frame only while a drag is under way: an iframe takes drag
 * events for its own document, so without this the editor would never see the
 * drop. A line shows where the block will land, between the sections the
 * pointer is between, and dragging near an edge scrolls the page.
 */
export function DropCatcher({
  rects,
  sectionIds,
  scale,
  width,
  height,
  onScroll,
}: {
  rects: SectionRect[]
  /** The builder's sections, in order, to turn a boundary into an index. */
  sectionIds: string[]
  scale: number
  width: number
  height: number
  onScroll: (dy: number) => void
}) {
  const dragging = useBuilderStore((s) => s.draggingBlock)
  const addSection = useBuilderStore((s) => s.addSection)
  const setDraggingBlock = useBuilderStore((s) => s.setDraggingBlock)
  const language = useBuilderLanguage()
  const sections = useBuilderStore((s) => s.sections)
  const [line, setLine] = useState<{ y: number; index: number } | null>(null)

  if (!dragging) return null

  // Boundaries a page block may be dropped at: between page sections, under
  // the top pins, above the bottom pins.
  function boundaryAt(y: number): { y: number; index: number } {
    const ordered = rects
      .map((rect) => ({ rect, index: sectionIds.indexOf(rect.id) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index)
    const page = ordered.filter(
      (entry) => !isLayoutSection(sections[entry.index]!)
    )
    const firstPage = sections.findIndex((s) => !isLayoutSection(s))
    const topPins = ordered.filter(
      (entry) =>
        isLayoutSection(sections[entry.index]!) &&
        entry.index < Math.max(firstPage, 0)
    )
    const startY = topPins.length
      ? topPins[topPins.length - 1]!.rect.top +
        topPins[topPins.length - 1]!.rect.height
      : 0
    const startIndex = topPins.length
      ? topPins[topPins.length - 1]!.index + 1
      : 0

    let best = { y: startY, index: startIndex }
    for (const entry of page) {
      const middle = entry.rect.top + entry.rect.height / 2
      if (y > middle)
        best = { y: entry.rect.top + entry.rect.height, index: entry.index + 1 }
    }
    return best
  }

  return (
    <div
      className="absolute inset-0 z-20"
      style={{ width: width * scale, height: height * scale }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('application/x-ncom-block'))
          return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        const box = event.currentTarget.getBoundingClientRect()
        const y = (event.clientY - box.top) / scale
        setLine(boundaryAt(y))
        const edge = 70
        if (event.clientY - box.top < edge) onScroll(-24)
        else if (box.bottom - event.clientY < edge) onScroll(24)
      }}
      onDragLeave={() => setLine(null)}
      onDrop={(event) => {
        event.preventDefault()
        const key = event.dataTransfer.getData('application/x-ncom-block')
        // A saved block travels as its type plus its id; the drop puts down
        // the saved copy rather than a fresh block of that type.
        const saved = event.dataTransfer.getData(
          'application/x-ncom-saved-block'
        )
        const definition = (
          sectionRegistry as Record<string, SectionDefinition>
        )[key]
        if (saved && line) void insertSavedBlock(saved, line.index)
        else if (definition && line)
          addSection(newSection(definition, language), line.index)
        setLine(null)
        setDraggingBlock(null)
      }}
    >
      {line && (
        <div
          className="bg-primary pointer-events-none absolute left-0 flex h-1 items-center justify-center rounded-full"
          style={{ top: line.y * scale - 2, width: width * scale }}
        >
          <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow">
            Drop here
          </span>
        </div>
      )}
    </div>
  )
}
