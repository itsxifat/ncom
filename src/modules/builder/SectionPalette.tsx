'use client'

import { Plus } from 'lucide-react'
import { sectionRegistry, type SectionDefinition } from '../sections/registry'
import { useBuilderStore } from './store'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

/**
 * The "Add block" menu.
 *
 * Drawn straight from the in-code registry, which is the only catalogue there
 * is — no database round trip, and nothing to keep in sync. A singleton block
 * the page already has is disabled rather than hidden, so the palette always
 * shows the full vocabulary and explains why the one entry is unavailable.
 */
export function SectionPalette() {
  const addSection = useBuilderStore((s) => s.addSection)
  const sections = useBuilderStore((s) => s.sections)

  const used = new Set(sections.map((section) => section.type))

  const groups = new Map<string, SectionDefinition[]>()
  for (const definition of Object.values(sectionRegistry)) {
    const list = groups.get(definition.category) ?? []
    list.push(definition as SectionDefinition)
    groups.set(definition.category, list)
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="w-full" />}>
        <Plus className="size-4" /> Add block
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="max-h-80 overflow-y-auto">
          {[...groups.entries()].map(([category, definitions]) => (
            <div key={category} className="mb-2">
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium uppercase">
                {category}
              </p>
              {definitions.map((definition) => {
                const taken = Boolean(
                  definition.singleton && used.has(definition.key)
                )
                return (
                  <button
                    key={definition.key}
                    type="button"
                    disabled={taken}
                    title={
                      taken
                        ? 'This page already has one'
                        : definition.description
                    }
                    onClick={() =>
                      addSection({
                        id: `temp-${crypto.randomUUID()}`,
                        type: definition.key,
                        content: structuredClone(
                          definition.defaultContent
                        ) as Record<string, unknown>,
                        config: {},
                        isVisible: true,
                      })
                    }
                    className="hover:bg-accent w-full rounded-md px-2 py-1.5 text-left disabled:opacity-40"
                  >
                    <span className="block text-sm">{definition.name}</span>
                    {definition.description && (
                      <span className="text-muted-foreground block text-xs">
                        {definition.description}
                      </span>
                    )}
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
