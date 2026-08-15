'use client'

import { useState } from 'react'
import { useBuilderStore } from './store'
import { getSectionDefinition } from '../sections/registry'
import type { SectionDefinition } from '../sections/registry'
import { collectText } from '../sections/editorFields'
import { SectionInspectorForm } from './SectionInspectorForm'
import { SectionDesignPanel } from './SectionDesignPanel'
import { cn } from '@/lib/utils'

/**
 * The right-hand editing panel.
 *
 * Split into Content and Design because they answer different questions —
 * "what does this say" versus "how does it look" — and merging them produced a
 * single scroll of thirty fields where the text you wanted to change was
 * buried under padding controls.
 *
 * Design is identical for every block type (it edits the section wrapper),
 * while Content comes from the block's own field list in the registry.
 */
type Tab = 'content' | 'design'

export function InspectorPanel() {
  const [tab, setTab] = useState<Tab>('content')

  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  const section = useBuilderStore((s) =>
    s.sections.find((sec) => sec.id === selectedSectionId)
  )
  const updateSectionContent = useBuilderStore((s) => s.updateSectionContent)
  const updateSectionConfig = useBuilderStore((s) => s.updateSectionConfig)

  if (!section) {
    return (
      <p className="text-muted-foreground px-2 py-8 text-center text-sm">
        Select a section to edit it.
      </p>
    )
  }

  const definition = getSectionDefinition(section.type)

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted flex rounded-full p-1">
        <TabButton active={tab === 'content'} onClick={() => setTab('content')}>
          Content
        </TabButton>
        <TabButton active={tab === 'design'} onClick={() => setTab('design')}>
          Design
        </TabButton>
      </div>

      {tab === 'design' ? (
        <SectionDesignPanel
          config={section.config}
          onChange={(config) => updateSectionConfig(section.id, config)}
          sampleText={
            definition
              ? collectText(definition.editorFields, section.content)
              : undefined
          }
        />
      ) : definition ? (
        <SectionInspectorForm
          key={section.id}
          definition={definition as SectionDefinition<Record<string, unknown>>}
          value={section.content}
          onChange={(content) => updateSectionContent(section.id, content)}
        />
      ) : (
        <p className="text-muted-foreground px-2 py-8 text-center text-sm">
          Unknown section type “{section.type}”.
        </p>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
