'use client'

import { useState } from 'react'
import { useBuilderStore } from './store'
import { getSectionDefinition } from '../sections/registry'
import type { SectionDefinition } from '../sections/registry'
import { collectText } from '../sections/editorFields'
import { SectionInspectorForm } from './SectionInspectorForm'
import { SectionDesignPanel } from './SectionDesignPanel'
import { ElementPanel } from './ElementPanel'
import { cn } from '@/lib/utils'

/**
 * The right-hand editing panel.
 *
 * Three tabs, because there are three different questions:
 *
 * - **Content** — what does this block say? Comes from the block's own field
 *   list in the registry.
 * - **Elements** — how does each individual thing inside it look? Per element,
 *   per breakpoint, plus the elements the merchant has added themselves.
 * - **Block** — how does the section as a whole sit on the page? Identical for
 *   every block type, because it edits the section wrapper.
 *
 * They were split rather than merged because a single scroll of a hundred and
 * fifty fields buries the one line of text someone opened the panel to change.
 * The Elements tab in particular is scoped to one element at a time for the
 * same reason: showing every control for every element at once would be the
 * wall of inputs this split exists to avoid.
 */
type Tab = 'content' | 'elements' | 'design'

export function InspectorPanel() {
  const [tab, setTab] = useState<Tab>('content')

  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  const selectedElementKey = useBuilderStore((s) => s.selectedElementKey)
  const section = useBuilderStore((s) =>
    s.sections.find((sec) => sec.id === selectedSectionId)
  )
  const updateSectionContent = useBuilderStore((s) => s.updateSectionContent)
  const updateSectionConfig = useBuilderStore((s) => s.updateSectionConfig)
  const selectElement = useBuilderStore((s) => s.selectElement)

  // Having an element selected *is* being on the Elements tab, rather than
  // something a tab has to be kept in sync with. Clicking an element on the
  // canvas therefore brings its controls into view on its own, and leaving the
  // tab drops the selection — so the outline on the canvas and the panel are
  // never showing two different things.
  const activeTab: Tab = selectedElementKey ? 'elements' : tab

  function chooseTab(next: Tab) {
    if (selectedElementKey) selectElement(selectedSectionId, null)
    setTab(next)
  }

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
        <TabButton
          active={activeTab === 'content'}
          onClick={() => chooseTab('content')}
        >
          Content
        </TabButton>
        <TabButton
          active={activeTab === 'elements'}
          onClick={() => chooseTab('elements')}
        >
          Elements
        </TabButton>
        <TabButton
          active={activeTab === 'design'}
          onClick={() => chooseTab('design')}
        >
          Block
        </TabButton>
      </div>

      {activeTab === 'elements' ? (
        <ElementPanel />
      ) : activeTab === 'design' ? (
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
