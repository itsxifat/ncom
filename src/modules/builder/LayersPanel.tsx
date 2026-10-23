'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Megaphone,
  Plus,
  Trash2,
} from 'lucide-react'
import { getSectionDefinition, sectionRegistry } from '../sections/registry'
import { isLayoutSection, useBuilderStore, type BuilderSection } from './store'
import { canDuplicate, canRemove, type PageContext } from './rules'
import { useBuilderSite } from './SiteContext'
import { newSection, useBuilderLanguage } from './BlockLibrary'
import { sectionLabel } from './sectionLabel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The page as a list, top to bottom.
 *
 * The canvas is where a merchant edits; this is where they see the whole
 * shape of the page at once and rearrange it. On a store the shared header and
 * footer are listed too, locked in place, so it is obvious they are part of
 * every page and where the page's own blocks begin and end.
 *
 * Each row names its block by what it says rather than what it is — see
 * `sectionLabel` — and a double-click renames it, for the page whose blocks
 * all start with the same words.
 */
export function LayersPanel() {
  const site = useBuilderSite()
  const sections = useBuilderStore((s) => s.sections)
  const reorderSections = useBuilderStore((s) => s.reorderSections)
  const addSection = useBuilderStore((s) => s.addSection)
  const language = useBuilderLanguage()

  const context: PageContext | null = site
    ? { site: site.kind, role: site.pageRole }
    : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderSections(String(active.id), String(over.id))
  }

  const top = sections.filter(
    (s) =>
      isLayoutSection(s) && getSectionDefinition(s.type)?.placement === 'top'
  )
  const bottom = sections.filter(
    (s) =>
      isLayoutSection(s) && getSectionDefinition(s.type)?.placement !== 'top'
  )
  const page = sections.filter((s) => !isLayoutSection(s))
  const hasAnnouncement = sections.some((s) => s.type === 'announcement')

  return (
    <div className="flex flex-col gap-3">
      {site?.kind === 'STORE' && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground px-1 text-xs font-semibold">
            Top of every page
          </p>
          {top.map((section) => (
            <LayerRow
              key={section.id}
              section={section}
              context={context}
              pinned
            />
          ))}
          {!hasAnnouncement && (
            <button
              type="button"
              onClick={() =>
                addSection({
                  ...newSection(sectionRegistry.announcement, language),
                  scope: 'layout',
                })
              }
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition"
            >
              <Megaphone className="size-3.5" />
              Add an announcement bar
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {site?.kind === 'STORE' && (
          <p className="text-muted-foreground px-1 text-xs font-semibold">
            This page
          </p>
        )}
        {page.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
            Nothing on this page yet. Add a block from the{' '}
            <Plus className="inline size-3.5" /> panel.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={page.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {page.map((section) => (
                <SortableLayer
                  key={section.id}
                  section={section}
                  context={context}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {site?.kind === 'STORE' && bottom.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground px-1 text-xs font-semibold">
            Bottom of every page
          </p>
          {bottom.map((section) => (
            <LayerRow
              key={section.id}
              section={section}
              context={context}
              pinned
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SortableLayer({
  section,
  context,
}: {
  section: BuilderSection
  context: PageContext | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'relative z-10 opacity-60')}
    >
      <LayerRow
        section={section}
        context={context}
        handle={
          <button
            type="button"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  )
}

function LayerRow({
  section,
  context,
  handle,
  pinned = false,
}: {
  section: BuilderSection
  context: PageContext | null
  handle?: React.ReactNode
  pinned?: boolean
}) {
  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  const selectSection = useBuilderStore((s) => s.selectSection)
  const revealSection = useBuilderStore((s) => s.revealSection)
  const duplicateSection = useBuilderStore((s) => s.duplicateSection)
  const removeSection = useBuilderStore((s) => s.removeSection)
  const updateSectionConfig = useBuilderStore((s) => s.updateSectionConfig)
  const toggleSectionVisibility = useBuilderStore(
    (s) => s.toggleSectionVisibility
  )
  const [renaming, setRenaming] = useState(false)

  const label = sectionLabel(section)
  const selected = selectedSectionId === section.id
  const removable = canRemove(section, context)

  function rename(value: string) {
    setRenaming(false)
    const next = value.trim().slice(0, 60) || undefined
    if (next === section.config?.label) return
    // Naming a block after the words it already shows, or after its kind,
    // is the same as not naming it — and leaving it unnamed keeps the row
    // following the block's headline as that changes.
    const unnamed = sectionLabel({ ...section, config: {} })
    updateSectionConfig(section.id, {
      ...section.config,
      label: next === unnamed.name || next === unnamed.kind ? undefined : next,
    })
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition',
        selected ? 'bg-lime/40 ring-foreground/20 ring-1' : 'hover:bg-muted'
      )}
    >
      {pinned ? (
        <Lock
          className="text-muted-foreground size-3.5 shrink-0"
          aria-label="Pinned"
        />
      ) : (
        handle
      )}
      {renaming ? (
        <input
          autoFocus
          defaultValue={label.name}
          maxLength={60}
          aria-label={`Name for this ${label.kind.toLowerCase()} block`}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => rename(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setRenaming(false)
          }}
          className="bg-background focus-visible:ring-ring min-w-0 flex-1 rounded border px-1.5 py-0.5 text-sm font-medium outline-none focus-visible:ring-2"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            selectSection(section.id)
            revealSection(section.id)
          }}
          onDoubleClick={() => !pinned && setRenaming(true)}
          title={
            pinned
              ? label.kind
              : `${label.named ? `${label.name} · ${label.kind}` : label.kind} — double-click to rename`
          }
          className={cn(
            'flex min-w-0 flex-1 items-baseline gap-1.5 text-left',
            !section.isVisible && 'text-muted-foreground line-through'
          )}
        >
          <span className="min-w-0 truncate font-medium">{label.name}</span>
          {label.named && (
            <span className="text-muted-foreground shrink-0 text-[11px]">
              {label.kind}
            </span>
          )}
        </button>
      )}
      <div
        className={cn(
          'flex items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100',
          (selected || !section.isVisible) && 'opacity-100'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => toggleSectionVisibility(section.id)}
          title={section.isVisible ? 'Hide' : 'Show'}
        >
          {section.isVisible ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
        </Button>
        {canDuplicate(section) && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => duplicateSection(section.id)}
            title="Duplicate"
          >
            <Copy className="size-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={!removable.ok}
          onClick={() => removable.ok && removeSection(section.id)}
          title={removable.ok ? 'Delete' : removable.reason}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
