'use client'

import { useBuilderStore } from './store'
import { getSectionDefinition } from '../sections/registry'
import type { SectionDefinition } from '../sections/registry'
import { SectionInspectorForm } from './SectionInspectorForm'

export function InspectorPanel() {
  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  const section = useBuilderStore((s) =>
    s.sections.find((sec) => sec.id === selectedSectionId)
  )
  const updateSectionContent = useBuilderStore((s) => s.updateSectionContent)

  if (!section) {
    return (
      <p className="text-muted-foreground px-2 py-8 text-center text-sm">
        Select a section to edit its content.
      </p>
    )
  }

  const definition = getSectionDefinition(section.sectionKey)
  if (!definition) {
    return (
      <p className="text-muted-foreground px-2 py-8 text-center text-sm">
        Unknown section type “{section.sectionKey}”.
      </p>
    )
  }

  return (
    <SectionInspectorForm
      key={section.id}
      definition={definition as SectionDefinition<Record<string, unknown>>}
      value={section.content}
      onChange={(content) => updateSectionContent(section.id, content)}
    />
  )
}
