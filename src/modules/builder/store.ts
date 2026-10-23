import { create } from 'zustand'
import { temporal } from 'zundo'
import type { PageTheme, SectionConfig } from '../sections/types'
import { getSectionDefinition } from '../sections/registry'
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
  /**
   * `layout` for an online store's shared blocks — the announcement bar,
   * header and footer — shown on the canvas around the page being edited and
   * saved to the store's layout page rather than this one.
   *
   * They sit in the same list as the page's own sections on purpose: the
   * canvas, the selection, the inspector, undo and the per-element design layer
   * all work on one list, and a header edited on the home page is the header.
   * The list keeps them pinned — top placements first, bottom ones last — and
   * the actions below refuse to move page sections past them.
   */
  scope?: 'page' | 'layout'
}

/** Whether a section is one of the store's shared layout blocks. */
export function isLayoutSection(section: Pick<BuilderSection, 'scope'>) {
  return section.scope === 'layout'
}

/** Where page sections may be placed: after the top pins, before the bottom. */
function pageRegion(sections: BuilderSection[]): {
  start: number
  end: number
} {
  let start = 0
  while (start < sections.length && isLayoutSection(sections[start]!)) start++
  let end = sections.length
  while (end > start && isLayoutSection(sections[end - 1]!)) end--
  return { start, end }
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
  /**
   * The elements the selected one sits inside, outermost first.
   *
   * Reported by the canvas on a click, because only the DOM knows what contains
   * what. It is the breadcrumb in the panel and the target of Escape — without
   * it a merchant who clicks a heading inside a card has no way back out to the
   * card except by hunting for it in the element list.
   *
   * Empty when the selection came from the list rather than from the page,
   * where there is no path to report.
   */
  selectedPath: { elementKey: string; index?: number }[]
  breakpoint: Breakpoint
  isDirty: boolean
  /**
   * Whether a page has been loaded into this store (by `setSections`).
   *
   * Autosave replaces the page's sections with this list, so saving a list
   * that never held the page would delete it. An empty store with an edit on
   * top happens when the store module is re-created underneath an open
   * builder — a hot reload in development — and this flag is what tells that
   * store apart from a page that really is empty.
   */
  seeded: boolean
  theme: PageTheme | null
  /**
   * A copied element style, for pasting onto another element.
   *
   * Deliberately not persisted and not in the undo history: it is a clipboard,
   * and undoing a paste should restore the element, not empty the clipboard.
   */
  styleClipboard: ElementDesign | null
  /**
   * The block being dragged out of the library, while it is.
   *
   * The canvas is an iframe, and a drag over an iframe is delivered to the
   * page inside it rather than to the editor. Knowing a drag is under way lets
   * the shell lay a catcher over the frame for its duration, so the drop lands
   * in the editor where the insertion maths lives.
   */
  draggingBlock: string | null
  setDraggingBlock: (type: string | null) => void
  /**
   * A section the canvas should scroll to — set by the layers list, where a
   * click means "show me that one", and never by a click on the canvas itself,
   * where the merchant is already looking at it and a jump would lose their
   * place. The counter makes asking twice for the same section work.
   */
  reveal: { id: string; n: number } | null
  revealSection: (id: string) => void
  /**
   * Every id a save has renamed, old to new — a new block's `temp-` id to the
   * one the server gave it, or a block Undo brought back after a save had
   * deleted it to the id it was saved under again.
   *
   * Kept because some work outlives an id: an AI request sent about a block
   * that was renamed while it ran has to find that block again when the answer
   * arrives, or it rewrites nothing and adds a copy instead. See
   * `resolveSectionId`. Cleared when a page loads.
   */
  idAliases: Record<string, string>
  /**
   * An AI request under way from the AI panel: the whole page, or one block.
   * Shown across the builder, because the panel can be closed while it runs
   * and edits made meanwhile to what it is rewriting are replaced when the
   * answer lands.
   */
  aiRequest: { scope: 'page' | 'section'; sectionId: string | null } | null
  setAiRequest: (
    request: { scope: 'page' | 'section'; sectionId: string | null } | null
  ) => void

  setTheme: (theme: PageTheme) => void
  setSections: (sections: BuilderSection[]) => void
  /**
   * Swaps in a whole new list as one edit — undoable in one step and saved
   * like any other change. For designs applied from the AI panel, where
   * `setSections` (which loads a page and marks it clean) would be wrong.
   */
  replaceSections: (sections: BuilderSection[]) => void
  selectSection: (id: string | null) => void
  /**
   * Adds a block. `at` is an index into the whole list — where the canvas's
   * "+" or a drop landed — and is clamped into the page's own region, so a
   * block can never be dropped above the header or below the footer.
   */
  addSection: (section: Omit<BuilderSection, 'order'>, at?: number) => void
  /** Moves a page section one place up or down, past any hidden ones. */
  moveSection: (id: string, direction: -1 | 1) => void
  removeSection: (id: string) => void
  duplicateSection: (id: string) => void
  reorderSections: (activeId: string, overId: string) => void
  updateSectionContent: (id: string, content: Record<string, unknown>) => void
  updateSectionConfig: (id: string, config: SectionConfig) => void
  toggleSectionVisibility: (id: string) => void

  selectElement: (
    sectionId: string | null,
    elementKey: string | null,
    path?: { elementKey: string; index?: number }[]
  ) => void
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
      selectedPath: [],
      breakpoint: 'desktop',
      isDirty: false,
      seeded: false,
      theme: null,
      styleClipboard: null,
      draggingBlock: null,

      setDraggingBlock: (type) => set({ draggingBlock: type }),

      reveal: null,
      revealSection: (id) =>
        set((state) => ({ reveal: { id, n: (state.reveal?.n ?? 0) + 1 } })),

      idAliases: {},
      aiRequest: null,
      setAiRequest: (request) => set({ aiRequest: request }),

      setTheme: (theme) => set({ theme }),

      setSections: (sections) =>
        set({
          sections: withReorderedIndices(sections),
          isDirty: false,
          seeded: true,
          idAliases: {},
        }),

      replaceSections: (sections) =>
        set((state) => ({
          sections: withReorderedIndices(sections),
          isDirty: true,
          selectedSectionId: sections.some(
            (section) => section.id === state.selectedSectionId
          )
            ? state.selectedSectionId
            : null,
          selectedElementKey: null,
          selectedPath: [],
        })),

      selectSection: (id) =>
        set((state) => ({
          selectedSectionId: id,
          // The element key only means anything inside its own block, so
          // carrying it across would leave the panel editing "title" on a
          // section that has no such element.
          selectedElementKey:
            state.selectedSectionId === id ? state.selectedElementKey : null,
          selectedPath:
            state.selectedSectionId === id ? state.selectedPath : [],
        })),

      selectElement: (sectionId, elementKey, path) =>
        set({
          selectedSectionId: sectionId,
          selectedElementKey: elementKey,
          selectedPath: path ?? [],
        }),

      addSection: (section, at) =>
        set((state) => {
          const next = [...state.sections]
          if (isLayoutSection(section)) {
            // A layout block goes where its placement says, never in the
            // middle of the page: the announcement bar is the strip above
            // everything, the header included; another top block follows the
            // top blocks already there; a bottom one goes last. The list order
            // is the order the layout saves in, and the live store draws it in
            // that order — and a merchant cannot drag a layout block to fix it.
            const placement =
              getSectionDefinition(section.type)?.placement ?? 'bottom'
            const afterTop = next.findIndex(
              (s) =>
                !isLayoutSection(s) ||
                getSectionDefinition(s.type)?.placement !== 'top'
            )
            const index =
              placement !== 'top'
                ? next.length
                : section.type === 'announcement'
                  ? 0
                  : afterTop === -1
                    ? next.length
                    : afterTop
            next.splice(index, 0, { ...section, order: 0 })
          } else {
            const { start, end } = pageRegion(next)
            const index = Math.min(Math.max(at ?? end, start), end)
            next.splice(index, 0, { ...section, order: 0 })
          }
          return {
            sections: withReorderedIndices(next),
            selectedSectionId: section.id,
            selectedElementKey: null,
            selectedPath: [],
            isDirty: true,
          }
        }),

      moveSection: (id, direction) =>
        set((state) => {
          const index = state.sections.findIndex((s) => s.id === id)
          const section = state.sections[index]
          if (!section || isLayoutSection(section)) return state
          const { start, end } = pageRegion(state.sections)
          const target = index + direction
          if (target < start || target >= end) return state
          const next = [...state.sections]
          next.splice(index, 1)
          next.splice(target, 0, section)
          return { sections: withReorderedIndices(next), isDirty: true }
        }),

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
          // The layout's blocks are one of each, shared by every page.
          if (isLayoutSection(original)) return state
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
          // Pinned blocks stay where they are, and nothing moves past them.
          if (
            isLayoutSection(state.sections[oldIndex]!) ||
            isLayoutSection(state.sections[newIndex]!)
          ) {
            return state
          }
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
          idAliases: { ...state.idAliases, ...mapping },
        })),
    }),
    {
      partialize: (state) => ({ sections: state.sections }),
      // Only a change to the blocks is a step to undo. Without this every
      // selection, hover and panel change was recorded too, and Undo walked
      // back through clicks that had changed nothing on the page.
      equality: (past, current) => past.sections === current.sections,
      limit: 50,
    }
  )
)

/**
 * The id a section has now, given one it was known by earlier — following
 * every rename a save has made since (see `idAliases`). A block can be renamed
 * more than once: saved from `temp-`, deleted, brought back by Undo and saved
 * again under a new id.
 */
export function resolveSectionId(id: string): string {
  const aliases = useBuilderStore.getState().idAliases
  let current = id
  // Bounded rather than trusting the chain: a loop in it would hang the tab.
  for (let hop = 0; hop < 20 && aliases[current]; hop++) {
    current = aliases[current]!
  }
  return current
}

/**
 * Undo and redo, as edits.
 *
 * The history holds only the sections (see `partialize`), so stepping through
 * it leaves `isDirty` as it was — false right after an autosave — and the step
 * would show on the canvas without ever being saved: reload, and the undone
 * change is back. Marking the page dirty here is what makes an undo stick.
 */
export function undoEdit() {
  const history = useBuilderStore.temporal.getState()
  if (history.pastStates.length === 0) return
  history.undo()
  useBuilderStore.setState({ isDirty: true })
}

export function redoEdit() {
  const history = useBuilderStore.temporal.getState()
  if (history.futureStates.length === 0) return
  history.redo()
  useBuilderStore.setState({ isDirty: true })
}
