'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import {
  getSectionDefinition,
  localizedDefaults,
  sectionRegistry,
  type SectionDefinition,
} from '../sections/registry'
import { siteLanguage, type SiteLanguage } from '../sections/language'
import { useBuilderStore } from './store'
import { BlockThumbnail } from './BlockThumbnail'
import { libraryBlocks } from './rules'
import { useBuilderSite } from './SiteContext'
import {
  SavedBlockTile,
  insertSavedBlock,
  refreshSavedBlocks,
  savedBlockMatches,
  useSavedBlocks,
} from './SavedBlocks'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** The library's groups, in the merchant's words rather than ours. */
const GROUP_LABEL: Record<string, string> = {
  Store: 'Shop',
  Commerce: 'Selling',
  Content: 'Text & media',
  Layout: 'Layout',
}

const GROUP_ORDER = {
  STORE: ['Store', 'Content', 'Commerce', 'Layout'],
  LANDING: ['Commerce', 'Content', 'Layout', 'Store'],
} as const

/**
 * A fresh section of a block, with its defaults, ready to add.
 *
 * The defaults are in the site's language: a merchant building a Bangla page
 * who drops in an FAQ gets a Bangla question to overwrite, not an English one
 * to translate.
 */
export function newSection(
  definition: Pick<
    SectionDefinition,
    'key' | 'defaultContent' | 'translations'
  >,
  language: SiteLanguage = 'en'
) {
  return {
    id: `temp-${crypto.randomUUID()}`,
    type: definition.key,
    content: localizedDefaults(definition, language),
    config: {},
    isVisible: true,
  }
}

/** The language the builder's page is in, for blocks it adds. */
export function useBuilderLanguage(): SiteLanguage {
  return siteLanguage(useBuilderStore((s) => s.theme))
}

/**
 * Every block this page can hold, as pictures to drag onto the page.
 *
 * Drag a block onto the canvas to put it exactly where it should go, or click
 * it to add it under the block that is selected (or at the end). The list is
 * filtered to the page: a product page offers related products, a landing page
 * offers the order form, and a block the page already has its one of — the
 * order form, the product details — shows why it is greyed out.
 *
 * The workspace's saved blocks come first, by the names the merchant gave
 * them: a section they made once and keep putting on campaign pages is what
 * they come here for most, and it is theirs rather than ours.
 */
export function BlockLibrary({
  onPicked,
  insertAt,
  compact = false,
}: {
  /** Called after a block is added, so a popover can close itself. */
  onPicked?: () => void
  /** Where a click inserts, when the library was opened from a "+". */
  insertAt?: number
  compact?: boolean
}) {
  const site = useBuilderSite()
  const [query, setQuery] = useState('')
  const sections = useBuilderStore((s) => s.sections)
  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  const addSection = useBuilderStore((s) => s.addSection)
  const revealSection = useBuilderStore((s) => s.revealSection)
  const setDraggingBlock = useBuilderStore((s) => s.setDraggingBlock)
  const language = useBuilderLanguage()
  const savedBlocks = useSavedBlocks((s) => s.blocks)

  // Asked again each time the library opens, so a block saved from another
  // site's builder, or another tab, is here without a reload.
  useEffect(() => {
    void refreshSavedBlocks()
  }, [])

  const context = site ? { site: site.kind, role: site.pageRole } : null
  const used = new Set(sections.map((section) => section.type))

  // Saved blocks this page can take. One whose kind of block does not belong
  // here — a store's product grid on a landing page — is left out rather than
  // greyed: it is not this page's to offer.
  const needle = query.trim().toLowerCase()
  const saved = (savedBlocks ?? []).filter((block) => {
    const definition = getSectionDefinition(block.type)
    return (
      definition !== undefined &&
      libraryBlocks([definition], context).length > 0 &&
      savedBlockMatches(block, needle)
    )
  })

  const groups = useMemo(() => {
    const available = libraryBlocks(
      Object.values(sectionRegistry) as SectionDefinition[],
      context
    )
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? available.filter((definition) =>
          [
            definition.name,
            definition.description ?? '',
            ...(definition.keywords ?? []),
          ]
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
      : available

    const order = GROUP_ORDER[context?.site ?? 'LANDING']
    return order
      .map((category) => ({
        category,
        blocks: matches.filter(
          (definition) => definition.category === category
        ),
      }))
      .filter((group) => group.blocks.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, context?.site, context?.role])

  /** Where a click puts a block: the "+" it came from, or under the selection. */
  function clickedAt() {
    const selectedIndex = sections.findIndex((s) => s.id === selectedSectionId)
    return insertAt ?? (selectedIndex >= 0 ? selectedIndex + 1 : undefined)
  }

  function add(definition: SectionDefinition) {
    const section = newSection(definition, language)
    addSection(section, clickedAt())
    // From the panel a block can land anywhere — under the selection, or at
    // the end of a long page — and one added out of sight reads as a click
    // that did nothing, so the canvas is taken to it. From a "+" on the page
    // the merchant is already looking at the spot.
    if (insertAt === undefined) revealSection(section.id)
    onPicked?.()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search blocks — banner, products, FAQ…"
          className="pl-9"
          autoFocus={compact}
        />
      </div>

      {!compact && (
        <p className="text-muted-foreground text-xs">
          Drag a block onto your page, or click it to add it below the selected
          block.
        </p>
      )}

      {groups.length === 0 && saved.length === 0 && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No block matches “{query}”.
        </p>
      )}

      {saved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold">
            Saved blocks
          </h3>
          <div
            className={cn(
              'grid gap-2',
              compact ? 'grid-cols-3' : 'grid-cols-2'
            )}
          >
            {saved.map((block) => {
              const taken = Boolean(
                getSectionDefinition(block.type)?.singleton &&
                used.has(block.type)
              )
              return (
                <SavedBlockTile
                  key={block.id}
                  block={block}
                  disabled={taken ? 'This page already has one' : undefined}
                  onInsert={() => {
                    void insertSavedBlock(block.id, clickedAt(), {
                      reveal: insertAt === undefined,
                    })
                    onPicked?.()
                  }}
                />
              )
            })}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.category} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold">
            {GROUP_LABEL[group.category] ?? group.category}
          </h3>
          <div
            className={cn(
              'grid gap-2',
              compact ? 'grid-cols-3' : 'grid-cols-2'
            )}
          >
            {group.blocks.map((definition) => {
              const taken = Boolean(
                definition.singleton && used.has(definition.key)
              )
              return (
                <button
                  key={definition.key}
                  type="button"
                  disabled={taken}
                  draggable={!taken}
                  title={
                    taken ? 'This page already has one' : definition.description
                  }
                  onClick={() => add(definition)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      'application/x-ncom-block',
                      definition.key
                    )
                    event.dataTransfer.effectAllowed = 'copy'
                    setDraggingBlock(definition.key)
                  }}
                  onDragEnd={() => setDraggingBlock(null)}
                  className="group hover:bg-muted flex cursor-grab flex-col gap-1.5 rounded-lg p-1.5 text-left transition active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <BlockThumbnail
                    type={definition.key}
                    className="group-hover:ring-foreground/30 transition"
                  />
                  <span className="truncate px-0.5 text-xs font-medium">
                    {definition.name}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
