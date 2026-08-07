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

function groupByCategory() {
  const groups = new Map<
    string,
    (typeof sectionRegistry)[keyof typeof sectionRegistry][]
  >()
  for (const definition of Object.values(sectionRegistry)) {
    const list = groups.get(definition.category) ?? []
    list.push(definition)
    groups.set(definition.category, list)
  }
  return groups
}

export function SectionPalette({
  componentDefinitionIds,
}: {
  /** Maps a section registry key to its ComponentDefinition id in this DB. */
  componentDefinitionIds: Record<string, string>
}) {
  const addSection = useBuilderStore((s) => s.addSection)
  const groups = groupByCategory()

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="w-full" />}>
        <Plus className="size-4" /> Add section
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="max-h-80 overflow-y-auto">
          {[...groups.entries()].map(([category, definitions]) => (
            <div key={category} className="mb-2">
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium uppercase">
                {category}
              </p>
              {definitions.map((definition) => {
                const componentDefinitionId =
                  componentDefinitionIds[definition.key]
                return (
                  <button
                    key={definition.key}
                    type="button"
                    disabled={!componentDefinitionId}
                    onClick={() =>
                      componentDefinitionId &&
                      addSection({
                        id: `temp-${crypto.randomUUID()}`,
                        componentDefinitionId,
                        sectionKey: definition.key,
                        content: definition.defaultContent as Record<
                          string,
                          unknown
                        >,
                        config: {},
                        isVisible: true,
                      })
                    }
                    className="hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-40"
                  >
                    {definition.name}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
