import { create } from 'zustand'
import { temporal } from 'zundo'
import type { PageTheme, SectionConfig } from '../sections/types'

export interface BuilderSection {
  id: string
  componentDefinitionId: string
  sectionKey: string
  order: number
  content: Record<string, unknown>
  config: SectionConfig
  isVisible: boolean
}

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

interface BuilderState {
  pageId: string
  sections: BuilderSection[]
  selectedSectionId: string | null
  breakpoint: Breakpoint
  isDirty: boolean
  theme: PageTheme | null

  setTheme: (theme: PageTheme) => void
  setSections: (sections: BuilderSection[]) => void
  selectSection: (id: string | null) => void
  addSection: (section: Omit<BuilderSection, 'order'>) => void
  removeSection: (id: string) => void
  duplicateSection: (id: string) => void
  reorderSections: (activeId: string, overId: string) => void
  updateSectionContent: (id: string, content: Record<string, unknown>) => void
  updateSectionConfig: (id: string, config: SectionConfig) => void
  toggleSectionVisibility: (id: string) => void
  setBreakpoint: (breakpoint: Breakpoint) => void
  markClean: () => void
  reconcileIds: (mapping: Record<string, string>) => void
}

function withReorderedIndices(sections: BuilderSection[]): BuilderSection[] {
  return sections.map((section, index) => ({ ...section, order: index }))
}

export const useBuilderStore = create<BuilderState>()(
  temporal(
    (set) => ({
      pageId: '',
      sections: [],
      selectedSectionId: null,
      breakpoint: 'desktop',
      isDirty: false,
      theme: null,

      setTheme: (theme) => set({ theme }),

      setSections: (sections) =>
        set({ sections: withReorderedIndices(sections), isDirty: false }),

      selectSection: (id) => set({ selectedSectionId: id }),

      addSection: (section) =>
        set((state) => ({
          sections: withReorderedIndices([
            ...state.sections,
            { ...section, order: 0 },
          ]),
          selectedSectionId: section.id,
          isDirty: true,
        })),

      removeSection: (id) =>
        set((state) => ({
          sections: withReorderedIndices(
            state.sections.filter((s) => s.id !== id)
          ),
          selectedSectionId:
            state.selectedSectionId === id ? null : state.selectedSectionId,
          isDirty: true,
        })),

      duplicateSection: (id) =>
        set((state) => {
          const index = state.sections.findIndex((s) => s.id === id)
          if (index === -1) return state
          const original = state.sections[index]!
          const copy: BuilderSection = {
            ...original,
            id: `temp-${crypto.randomUUID()}`,
          }
          const next = [...state.sections]
          next.splice(index + 1, 0, copy)
          return {
            sections: withReorderedIndices(next),
            selectedSectionId: copy.id,
            isDirty: true,
          }
        }),

      reorderSections: (activeId, overId) =>
        set((state) => {
          const oldIndex = state.sections.findIndex((s) => s.id === activeId)
          const newIndex = state.sections.findIndex((s) => s.id === overId)
          if (oldIndex === -1 || newIndex === -1) return state
          const next = [...state.sections]
          const [moved] = next.splice(oldIndex, 1)
          next.splice(newIndex, 0, moved!)
          return { sections: withReorderedIndices(next), isDirty: true }
        }),

      updateSectionContent: (id, content) =>
        set((state) => ({
          sections: state.sections.map((s) =>
            s.id === id ? { ...s, content } : s
          ),
          isDirty: true,
        })),

      updateSectionConfig: (id, config) =>
        set((state) => ({
          sections: state.sections.map((s) =>
            s.id === id ? { ...s, config } : s
          ),
          isDirty: true,
        })),

      toggleSectionVisibility: (id) =>
        set((state) => ({
          sections: state.sections.map((s) =>
            s.id === id ? { ...s, isVisible: !s.isVisible } : s
          ),
          isDirty: true,
        })),

      setBreakpoint: (breakpoint) => set({ breakpoint }),

      markClean: () => set({ isDirty: false }),

      reconcileIds: (mapping) =>
        set((state) => ({
          sections: state.sections.map((s) =>
            mapping[s.id] ? { ...s, id: mapping[s.id]! } : s
          ),
          selectedSectionId: state.selectedSectionId
            ? (mapping[state.selectedSectionId] ?? state.selectedSectionId)
            : null,
        })),
    }),
    { partialize: (state) => ({ sections: state.sections }), limit: 50 }
  )
)
