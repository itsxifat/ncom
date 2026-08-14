'use client'

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
import { GripVertical, Eye, EyeOff, Copy, Trash2 } from 'lucide-react'
import { useBuilderStore, type BuilderSection } from './store'
import { getSectionDefinition } from '../sections/registry'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function OutlineRow({ section }: { section: BuilderSection }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  const selectSection = useBuilderStore((s) => s.selectSection)
  const duplicateSection = useBuilderStore((s) => s.duplicateSection)
  const removeSection = useBuilderStore((s) => s.removeSection)
  const toggleSectionVisibility = useBuilderStore(
    (s) => s.toggleSectionVisibility
  )

  const definition = getSectionDefinition(section.type)
  const isSelected = selectedSectionId === section.id

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm',
        isSelected ? 'border-primary bg-accent' : 'border-transparent',
        isDragging && 'opacity-50'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => selectSection(section.id)}
        className={cn(
          'flex-1 truncate text-left',
          !section.isVisible && 'opacity-50'
        )}
      >
        {definition?.name ?? section.type}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => toggleSectionVisibility(section.id)}
        title={section.isVisible ? 'Hide section' : 'Show section'}
      >
        {section.isVisible ? (
          <Eye className="size-3.5" />
        ) : (
          <EyeOff className="size-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => duplicateSection(section.id)}
        title="Duplicate"
      >
        <Copy className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => removeSection(section.id)}
        title="Delete"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

export function OutlinePanel() {
  const sections = useBuilderStore((s) => s.sections)
  const reorderSections = useBuilderStore((s) => s.reorderSections)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderSections(String(active.id), String(over.id))
  }

  if (sections.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-center text-sm">
        No sections yet. Add one below.
      </p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sections.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-1">
          {sections.map((section) => (
            <OutlineRow key={section.id} section={section} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
