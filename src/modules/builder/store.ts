import { create } from 'zustand'
import { temporal } from 'zundo'
import type { PageTheme, SectionConfig } from '../sections/types'
import type {
  ElementDesign,
  ElementStyle,
  StyleBreakpoint,
} from '../sections/elementStyle'
import {
  newExtraElement,
  extraKey,
  type ExtraElement,
  type ExtraElementType,
} from '../sections/elementDescriptors'

export interface BuilderSection {
  id: string
  /** A block key from modules/sections/registry.ts. */
  type: string
  order: number
  content: Record<string, unknown>
  config: SectionConfig
  isVisible: boolean
}

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

/**
 * The canvas frame a merchant is looking at, as the breakpoint their edits are
 * written to.
 *
 * Desktop is `base` — the value everything else falls back to — rather than a
 * breakpoint of its own. That is the whole inheritance model in one line: there
 * is no "desktop override", there is the value and then the two narrower
 * screens that may disagree with it.
 */
export function styleBreakpoint(breakpoint: Breakpoint): StyleBreakpoint {
  return breakpoint === 'desktop' ? 'base' : breakpoint
}

/** Drops keys whose value is undefined, and the object itself if nothing is left. */
function prune<T extends object>(value: T | undefined): T | undefined {
  if (!value) return undefined
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  return entries.length ? (Object.fromEntries(entries) as T) : undefined
}

interface BuilderState {
  pageId: string
  sections: BuilderSection[]
  selectedSectionId: string | null
  /**
   * Which element inside the selected section is being edited, as its element
   * key — `title`, `card#2` for one instance of a repeated element, `x:<id>`
   * for one a merchant added.
   *
   * Null means the section itself is selected, which is what the Design tab
   * edits. The two are one selection, not two: choosing an element on the
   * canvas has to move the section selection with it or the panel would be
   * editing a block the merchant is not looking at.
   */
  selectedElementKey: string | null
  breakpoint: Breakpoint
  isDirty: boolean
  theme: PageTheme | null
  /**
   * A copied element style, for pasting onto another element.
   *
   * Deliberately not persisted and not in the undo history: it is a clipboard,
   * and undoing a paste should restore the element, not empty the clipboard.
   */
  styleClipboard: ElementDesign | null

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

  selectElement: (sectionId: string | null, elementKey: string | null) => void
  /** Merges a patch into one element's style at one breakpoint. */
  setElementStyle: (
    sectionId: string,
    elementKey: string,
    breakpoint: StyleBreakpoint,
    patch: Partial<ElementStyle>
  ) => void
  /** Merges a patch into one element's hover state, transition or animation. */
  setElementDesign: (
    sectionId: string,
    elementKey: string,
    patch: Partial<ElementDesign>
  ) => void
  /** Clears one property so it inherits again. */
  resetElementProperty: (
    sectionId: string,
    elementKey: string,
    breakpoint: StyleBreakpoint,
    property: keyof ElementStyle
  ) => void
  /** Clears an element's entire design, at every breakpoint. */
  resetElement: (sectionId: string, elementKey: string) => void

  addExtraElement: (
    sectionId: string,
    type: ExtraElementType,
    slot: string
  ) => void
  updateExtraElement: (
    sectionId: string,
    extraId: string,
    patch: Partial<ExtraElement>
  ) => void
  removeExtraElement: (sectionId: string, extraId: string) => void
  /** Copies an element to a new added element carrying the same style. */
  duplicateElement: (
    sectionId: string,
    elementKey: string,
    type: ExtraElementType,
    slot: string
  ) => void

  copyElementStyle: (sectionId: string, elementKey: string) => void
  pasteElementStyle: (sectionId: string, elementKey: string) => void
  setBreakpoint: (breakpoint: Breakpoint) => void
  markClean: () => void
  reconcileIds: (mapping: Record<string, string>) => void
}

function withReorderedIndices(sections: BuilderSection[]): BuilderSection[] {
  return sections.map((section, index) => ({ ...section, order: index }))
}

type SectionsPatch = { sections: BuilderSection[]; isDirty: true }

/** Rewrites one section's config, leaving every other section untouched. */
function editConfig(
  state: { sections: BuilderSection[] },
  sectionId: string,
  edit: (config: SectionConfig) => SectionConfig
): SectionsPatch {
  return {
    sections: state.sections.map((section) =>
      section.id === sectionId
        ? { ...section, config: edit(section.config ?? {}) }
        : section
    ),
    isDirty: true,
  }
}

/** Rewrites one element's design inside one section's config. */
function editDesign(
  state: { sections: BuilderSection[] },
  sectionId: string,
  elementKey: string,
  edit: (design: ElementDesign) => ElementDesign
): SectionsPatch {
  return editConfig(state, sectionId, (config) => {
    const design = edit(config.elements?.[elementKey] ?? {})
    const elements = { ...config.elements }
    // An element whose every override has been cleared is removed outright, so
    // a config never accumulates empty husks and "has this been styled?" is
    // answerable by the key existing.
    if (Object.keys(prune(design) ?? {}).length) {
      elements[elementKey] = design
    } else {
      delete elements[elementKey]
    }
    return {
      ...config,
      elements: Object.keys(elements).length ? elements : undefined,
    }
  })
}

export const useBuilderStore = create<BuilderState>()(
  temporal(
    (set) => ({
      pageId: '',
      sections: [],
      selectedSectionId: null,
      selectedElementKey: null,
      breakpoint: 'desktop',
      isDirty: false,
      theme: null,
      styleClipboard: null,

      setTheme: (theme) => set({ theme }),

      setSections: (sections) =>
        set({ sections: withReorderedIndices(sections), isDirty: false }),

      selectSection: (id) =>
        set((state) => ({
          selectedSectionId: id,
          // The element key only means anything inside its own block, so
          // carrying it across would leave the panel editing "title" on a
          // section that has no such element.
          selectedElementKey:
            state.selectedSectionId === id ? state.selectedElementKey : null,
        })),

      selectElement: (sectionId, elementKey) =>
        set({
          selectedSectionId: sectionId,
          selectedElementKey: elementKey,
        }),

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

      setElementStyle: (sectionId, elementKey, breakpoint, patch) =>
        set((state) =>
          editDesign(state, sectionId, elementKey, (design) => ({
            ...design,
            // Pruned so a control cleared back to "inherit" removes the key
            // rather than storing `undefined`. That distinction is the whole
            // inheritance contract: a key that exists pins the element, and a
            // key that does not lets the theme through.
            [breakpoint]: prune({ ...design[breakpoint], ...patch }),
          }))
        ),

      setElementDesign: (sectionId, elementKey, patch) =>
        set((state) =>
          editDesign(state, sectionId, elementKey, (design) => ({
            ...design,
            ...patch,
          }))
        ),

      resetElementProperty: (sectionId, elementKey, breakpoint, property) =>
        set((state) =>
          editDesign(state, sectionId, elementKey, (design) => {
            const next = { ...design[breakpoint] }
            delete next[property]
            return { ...design, [breakpoint]: prune(next) }
          })
        ),

      resetElement: (sectionId, elementKey) =>
        set((state) =>
          editConfig(state, sectionId, (config) => {
            const elements = { ...config.elements }
            delete elements[elementKey]
            return {
              ...config,
              elements: Object.keys(elements).length ? elements : undefined,
            }
          })
        ),

      addExtraElement: (sectionId, type, slot) =>
        set((state) =>
          editConfig(state, sectionId, (config) => ({
            ...config,
            extras: [
              ...(config.extras ?? []),
              newExtraElement(type, crypto.randomUUID(), slot),
            ],
          }))
        ),

      updateExtraElement: (sectionId, extraId, patch) =>
        set((state) =>
          editConfig(state, sectionId, (config) => ({
            ...config,
            extras: (config.extras ?? []).map((extra) =>
              extra.id === extraId ? { ...extra, ...patch } : extra
            ),
          }))
        ),

      removeExtraElement: (sectionId, extraId) =>
        set((state) => {
          const next = editConfig(state, sectionId, (config) => {
            const extras = (config.extras ?? []).filter(
              (extra) => extra.id !== extraId
            )
            // The element's styling goes with it. Leaving it behind would
            // silently re-skin the next added element that happened to be
            // given the same id, and would grow the config forever.
            const elements = { ...config.elements }
            delete elements[extraKey(extraId)]
            return {
              ...config,
              extras: extras.length ? extras : undefined,
              elements: Object.keys(elements).length ? elements : undefined,
            }
          })
          return {
            ...next,
            selectedElementKey:
              state.selectedElementKey === extraKey(extraId)
                ? null
                : state.selectedElementKey,
          }
        }),

      /**
       * Duplicating anything produces an *added* element, including when the
       * original is one of the block's own.
       *
       * A block's built-in elements are markup in a React component — there is
       * no second headline for the hero to render. So a duplicate is a new
       * element in the same slot carrying a copy of the original's style, which
       * is what the merchant actually wanted: another one of those, looking
       * like that.
       */
      duplicateElement: (sectionId, elementKey, type, slot) =>
        set((state) => {
          const id = crypto.randomUUID()
          const section = state.sections.find((s) => s.id === sectionId)
          const source = section?.config?.elements?.[elementKey]
          const extra = newExtraElement(type, id, slot)

          const next = editConfig(state, sectionId, (config) => ({
            ...config,
            extras: [...(config.extras ?? []), extra],
            elements: source
              ? { ...config.elements, [extraKey(id)]: structuredClone(source) }
              : config.elements,
          }))
          return { ...next, selectedElementKey: extraKey(id) }
        }),

      copyElementStyle: (sectionId, elementKey) =>
        set((state) => {
          const section = state.sections.find((s) => s.id === sectionId)
          const design = section?.config?.elements?.[elementKey]
          return { styleClipboard: design ? structuredClone(design) : null }
        }),

      pasteElementStyle: (sectionId, elementKey) =>
        set((state) => {
          const clipboard = state.styleClipboard
          if (!clipboard) return state
          // Replaces rather than merges. "Paste style" means "look like that
          // one", and a merge would leave whatever the target already had set
          // showing through wherever the copied style happened to say nothing.
          return editDesign(state, sectionId, elementKey, () =>
            structuredClone(clipboard)
          )
        }),

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
