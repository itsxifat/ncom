'use client'

import { Plus } from 'lucide-react'
import { sectionRegistry } from '../sections/registry'
import { useBuilderStore } from './store'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface BuilderLiquidSection {
  componentDefinitionId: string
  key: string
  name: string
  category: string
  editorFields: unknown[]
  defaultContent: Record<string, unknown>
}

/** One entry in the palette, from either source. */
interface PaletteEntry {
  key: string
  name: string
  category: string
  componentDefinitionId: string | undefined
  defaultContent: Record<string, unknown>
}

/**
 * The "Add section" menu.
 *
 * It draws from two sources, which is the whole reason custom sections are
 * usable at all: the built-in React registry, and the Liquid sections this
 * organisation has written in the Code tab. Previously it listed only the
 * registry, so a section authored in Liquid was saved to the database and then
 * never appeared anywhere — the Code tab looked like it did nothing.
 */
export function SectionPalette({
  componentDefinitionIds,
  liquidSections = [],
}: {
  /** Maps a section registry key to its ComponentDefinition id in this DB. */
  componentDefinitionIds: Record<string, string>
  liquidSections?: BuilderLiquidSection[]
}) {
  const addSection = useBuilderStore((s) => s.addSection)

  const entries: PaletteEntry[] = [
    ...Object.values(sectionRegistry).map((definition) => ({
      key: definition.key,
      name: definition.name,
      category: definition.category,
      componentDefinitionId: componentDefinitionIds[definition.key],
      defaultContent: definition.defaultContent as Record<string, unknown>,
    })),
    ...liquidSections.map((section) => ({
      key: section.key,
      name: section.name,
      // Grouped under one heading so merchants can tell their own sections
      // apart from the built-ins at a glance.
      category: section.category || 'Custom sections',
      componentDefinitionId: section.componentDefinitionId,
      defaultContent: section.defaultContent,
    })),
  ]

  const groups = new Map<string, PaletteEntry[]>()
  for (const entry of entries) {
    const list = groups.get(entry.category) ?? []
    list.push(entry)
    groups.set(entry.category, list)
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="w-full" />}>
        <Plus className="size-4" /> Add section
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="max-h-80 overflow-y-auto">
          {[...groups.entries()].map(([category, categoryEntries]) => (
            <div key={category} className="mb-2">
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium uppercase">
                {category}
              </p>
              {categoryEntries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  disabled={!entry.componentDefinitionId}
                  onClick={() =>
                    entry.componentDefinitionId &&
                    addSection({
                      id: `temp-${crypto.randomUUID()}`,
                      componentDefinitionId: entry.componentDefinitionId,
                      sectionKey: entry.key,
                      content: entry.defaultContent,
                      config: {},
                      isVisible: true,
                    })
                  }
                  className="hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-40"
                >
                  {entry.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
