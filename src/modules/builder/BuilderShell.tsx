'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStore } from 'zustand'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  FileText,
  History,
  Layers,
  Loader2,
  Monitor,
  MousePointerClick,
  Paintbrush,
  Plus,
  Redo2,
  Rocket,
  RotateCw,
  Smartphone,
  Sparkles,
  Tablet,
  TriangleAlert,
  Type,
  Undo2,
} from 'lucide-react'
import {
  isLayoutSection,
  redoEdit,
  undoEdit,
  useBuilderStore,
  type BuilderSection,
  type Breakpoint,
} from './store'
import {
  useAutosave,
  type SaveResult,
  type SaveRevisions,
  type SectionSavePayload,
} from './useAutosave'
import { Canvas } from './Canvas'
import { BlockLibrary } from './BlockLibrary'
import { LayersPanel } from './LayersPanel'
import { PagesPanel } from './PagesPanel'
import { DesignPanel } from './DesignPanel'
import { AiPanel } from './AiPanel'
import { HistoryPanel } from './HistoryPanel'
import { SavedBlockDialogs } from './SavedBlocks'
import { InspectorPanel } from './InspectorPanel'
import { DeliveryPanel, type DeliveryPanelProps } from './DeliveryPanel'
import {
  publishChecks,
  templateReviewTexts,
  type PublishIssue,
} from './publishChecks'
import { PublishCheckDialog } from './PublishCheckDialog'
import { pageOffersForCodeAction } from './code-actions'
import {
  ProductCatalogProvider,
  type SellableVariant,
} from './ProductCatalogContext'
import {
  BuilderSiteProvider,
  useBuilderSite,
  type BuilderSite,
} from './SiteContext'
import type { PageTheme } from '../sections/types'
import type { PickerProduct } from '@/server/services/productService'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const BREAKPOINTS: {
  value: Breakpoint
  icon: typeof Monitor
  label: string
}[] = [
  { value: 'desktop', icon: Monitor, label: 'Computer' },
  { value: 'tablet', icon: Tablet, label: 'Tablet' },
  { value: 'mobile', icon: Smartphone, label: 'Phone' },
]

type PanelKey = 'add' | 'layers' | 'pages' | 'design' | 'ai' | 'history'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * The builder.
 *
 * Laid out the way the page builders merchants have already met are laid out,
 * so nothing here needs learning: the page in the middle, a rail of four
 * tools on the left — add something, see the layers, switch page, change the
 * look — and the settings of whatever is selected on the right. Everything a
 * merchant can do on a panel they can also do on the page itself: click to
 * select, double-click to type, drag a block in, use the toolbar on a section.
 *
 * Nothing goes live while they work. Changes save as a draft on their own;
 * Publish puts the whole site live as the builder shows it.
 */
export function BuilderShell({
  entityId,
  backHref,
  title,
  theme,
  initialSections,
  products = [],
  catalog,
  delivery,
  canvasSrc,
  onSave,
  initialRevisions,
  site = null,
  publish,
  saveTheme,
  createPage,
  previewHref,
  initiallyLive = false,
  initiallyDirty = false,
}: {
  entityId: string
  backHref: string
  title: string
  theme: PageTheme
  initialSections: BuilderSection[]
  /** Sellable variants, for sections that take orders. */
  products?: SellableVariant[]
  /** The same catalogue with photos, prices and stock, for the product picker. */
  catalog?: {
    products: PickerProduct[]
    /** Where the picker's next page starts, for catalogues past one page. */
    cursor?: string | null
    currencyCode: string
  }
  /**
   * How this page charges for delivery, and what it rewards a big basket with.
   * Landing pages only — a store's delivery is the workspace's.
   */
  delivery?: DeliveryPanelProps
  canvasSrc: string
  /**
   * Saves the draft — unless the page has been saved elsewhere since
   * `expected`, when it saves nothing and answers `{ conflict: true }`.
   */
  onSave: (
    sections: SectionSavePayload[],
    expected: SaveRevisions
  ) => Promise<SaveResult>
  /** The versions of the page and its store's layout this builder opened. */
  initialRevisions: SaveRevisions
  /** The site around the page: its kind, its pages, its catalogue. */
  site?: BuilderSite | null
  publish?: () => Promise<Result<{ published: number }>>
  saveTheme?: (
    patch: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string }>
  createPage?: (
    starterKey: string,
    title: string
  ) => Promise<{ ok: true; pageId: string } | { ok: false; error: string }>
  previewHref?: string
  /** Whether the site has been published before. */
  initiallyLive?: boolean
  /** Whether there are saved changes the live site does not have yet. */
  initiallyDirty?: boolean
}) {
  // The order form quotes the page's delivery rates and promotions, so the
  // canvas has to reload when they change even though no block's own content
  // did.
  const [offersRevision, setOffersRevision] = useState(0)
  const pageSectionCount = initialSections.filter(
    (section) => !isLayoutSection(section)
  ).length
  const [panel, setPanel] = useState<PanelKey | null>(
    pageSectionCount < 3 ? 'add' : 'layers'
  )
  const [live, setLive] = useState(initiallyLive)
  const [unpublished, setUnpublished] = useState(
    initiallyDirty || !initiallyLive
  )
  const [publishing, startPublish] = useTransition()
  /** What the pre-publish check found, while its dialog is open. */
  const [publishIssues, setPublishIssues] = useState<PublishIssue[] | null>(
    null
  )
  const [checking, setChecking] = useState(false)

  const setSections = useBuilderStore((s) => s.setSections)
  const setTheme = useBuilderStore((s) => s.setTheme)
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const setBreakpoint = useBuilderStore((s) => s.setBreakpoint)
  const selectSection = useBuilderStore((s) => s.selectSection)
  const revealSection = useBuilderStore((s) => s.revealSection)

  const aiRequest = useBuilderStore((s) => s.aiRequest)

  const {
    status,
    saveNow,
    reset: resetAutosave,
    isConflicted,
  } = useAutosave(async (sections, expected) => {
    const result = await onSave(sections, expected)
    if (!('conflict' in result)) setUnpublished(true)
    return result
  }, initialRevisions)

  // A theme change is a change the live site does not have yet, just like a
  // block edit — without this the button kept saying "Published" after the
  // shop was switched to Bangla, and nothing told the merchant to publish.
  const saveThemeAndMark =
    saveTheme &&
    (async (patch: Record<string, unknown>) => {
      const result = await saveTheme(patch)
      if (result.ok) setUnpublished(true)
      return result
    })

  const temporal = useBuilderStore.temporal
  const canUndo = useStore(temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(temporal, (s) => s.futureStates.length > 0)

  useEffect(() => {
    setSections(initialSections)
    setTheme(theme)
    selectSection(null)
    // A fresh page gets a fresh history: undoing into another page's blocks
    // would be undoing something that is not on the screen.
    temporal.getState().clear()
    // And saves from here on build on the version just loaded. Only on a new
    // page, never on a re-render: the props carry whatever the server holds
    // now, and taking its version as ours would save over a change made
    // elsewhere instead of noticing it.
    resetAutosave(initialRevisions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId])

  /**
   * Publish, after a look at what is about to go live (see `publishChecks`).
   * A landing page's offers are read fresh for it — they are set up outside
   * the builder, and the count the page opened with may be out of date.
   */
  async function requestPublish() {
    if (!publish || checking) return
    setChecking(true)
    try {
      const [commerce, exampleReviews] = await Promise.all([
        site?.kind === 'LANDING'
          ? pageOffersForCodeAction(site.storeId, site.pageId).catch(() => null)
          : null,
        templateReviewTexts().catch(() => undefined),
      ])
      const issues = publishChecks(useBuilderStore.getState().sections, {
        kind: site?.kind ?? null,
        offers: commerce?.offers,
        exampleReviews,
      })
      if (issues.length) setPublishIssues(issues)
      else runPublish()
    } finally {
      setChecking(false)
    }
  }

  function runPublish() {
    if (!publish) return
    startPublish(async () => {
      // Whatever is still waiting to save goes first — publishing the version
      // from a second ago would leave out the last thing the merchant did.
      if (useBuilderStore.getState().isDirty) await saveNow()
      // Changed elsewhere: what would go live is a version this canvas does
      // not show.
      if (isConflicted()) {
        toast.error(
          'This page was changed somewhere else. Reload to see the latest version before you publish.'
        )
        return
      }
      const result = await publish()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setLive(true)
      setUnpublished(false)
      toast.success(
        site?.kind === 'STORE' ? 'Your store is live' : 'Your page is live',
        {
          description: site?.liveUrl,
          action: site?.liveUrl
            ? {
                label: 'View',
                onClick: () => window.open(site.liveUrl, '_blank', 'noopener'),
              }
            : undefined,
        }
      )
    })
  }

  const tools: { key: PanelKey; label: string; icon: typeof Plus }[] = [
    { key: 'add', label: 'Add', icon: Plus },
    { key: 'layers', label: 'Layers', icon: Layers },
    ...(site?.kind === 'STORE'
      ? [{ key: 'pages' as const, label: 'Pages', icon: FileText }]
      : []),
    ...(saveTheme
      ? [{ key: 'design' as const, label: 'Design', icon: Paintbrush }]
      : []),
    ...(site ? [{ key: 'ai' as const, label: 'AI', icon: Sparkles }] : []),
    ...(site
      ? [{ key: 'history' as const, label: 'History', icon: History }]
      : []),
  ]

  return (
    <BuilderSiteProvider site={site}>
      <ProductCatalogProvider
        variants={products}
        products={catalog?.products}
        cursor={catalog?.cursor}
        currencyCode={catalog?.currencyCode}
      >
        <div className="bg-background fixed inset-0 z-50 flex flex-col">
          <header className="bg-card flex h-14 shrink-0 items-center gap-3 border-b px-3">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={backHref} />}
              nativeButton={false}
            >
              <ArrowLeft />
              Exit
            </Button>
            <div className="bg-border h-6 w-px" />
            <PageSwitcher title={title} />

            <div className="mx-auto flex items-center gap-0.5 rounded-lg border p-0.5">
              {BREAKPOINTS.map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={breakpoint === value ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setBreakpoint(value)}
                  title={`See it on a ${label.toLowerCase()}`}
                  aria-pressed={breakpoint === value}
                >
                  <Icon className="size-4" />
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!canUndo}
                onClick={undoEdit}
                title="Undo"
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!canRedo}
                onClick={redoEdit}
                title="Redo"
              >
                <Redo2 className="size-4" />
              </Button>
            </div>
            <SaveStatusIndicator status={status} />
            {previewHref && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <a href={previewHref} target="_blank" rel="noreferrer" />
                }
                nativeButton={false}
              >
                <Eye />
                Preview
              </Button>
            )}
            {publish && (
              <Button
                size="sm"
                onClick={requestPublish}
                disabled={publishing || checking}
                className="min-w-28"
              >
                {publishing || checking ? (
                  <Loader2 className="animate-spin" />
                ) : unpublished ? (
                  <Rocket />
                ) : (
                  <Check />
                )}
                {publishing
                  ? 'Publishing…'
                  : checking
                    ? 'Checking…'
                    : !live
                      ? 'Publish'
                      : unpublished
                        ? 'Publish changes'
                        : 'Published'}
              </Button>
            )}
          </header>
          <PublishCheckDialog
            issues={publishIssues}
            firstPublish={!live}
            onClose={() => setPublishIssues(null)}
            onShow={(sectionId) => {
              setPublishIssues(null)
              selectSection(sectionId)
              revealSection(sectionId)
            }}
            onPublishAnyway={() => {
              setPublishIssues(null)
              runPublish()
            }}
          />

          {status === 'conflict' ? (
            <div
              role="alert"
              className="bg-destructive/10 text-destructive flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm"
            >
              <TriangleAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                This page was changed somewhere else — for example by an AI
                editor. Reload to see the latest version. Changes made here
                since then have not been saved.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                <RotateCw />
                Reload
              </Button>
            </div>
          ) : (
            aiRequest && (
              <div
                role="status"
                className="bg-muted flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm"
              >
                <Loader2 className="size-4 shrink-0 animate-spin" />
                <span className="min-w-0 flex-1">
                  {aiRequest.scope === 'section'
                    ? 'The AI is rewriting the block you chose. Changes you make to that block before it finishes will be replaced.'
                    : 'The AI is rewriting this page. Changes you make to its blocks before it finishes will be replaced; blocks you add meanwhile are kept.'}
                </span>
              </div>
            )
          )}

          <div className="flex min-h-0 flex-1">
            <nav
              aria-label="Builder tools"
              className="bg-card flex w-16 shrink-0 flex-col items-center gap-1 border-r py-2"
            >
              {tools.map(({ key, label, icon: Icon }) => {
                // The AI keeps working with its panel closed; the rail says so.
                const working = key === 'ai' && aiRequest !== null
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setPanel((current) => (current === key ? null : key))
                    }
                    aria-pressed={panel === key}
                    title={
                      working ? 'The AI is working on your page' : undefined
                    }
                    className={cn(
                      'flex w-13 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition',
                      panel === key
                        ? 'bg-lime text-ink'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {working ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Icon className="size-5" />
                    )}
                    {label}
                  </button>
                )
              })}
            </nav>

            {/*
              Always mounted — hidden while no panel is open — so the AI panel
              inside it can stay mounted too. It owns a request that can take a
              minute, and unmounting it cancels the request (see useAiDesign):
              closing the panel or glancing at Layers threw the design away
              after it had already been counted against the day's allowance.
            */}
            <aside
              className={cn(
                'bg-card flex w-80 shrink-0 flex-col border-r',
                !panel && 'hidden'
              )}
            >
              <div className="flex h-12 shrink-0 items-center border-b px-4">
                <h2 className="text-sm font-semibold">
                  {panel === 'add'
                    ? 'Add a block'
                    : panel === 'layers'
                      ? 'Layers'
                      : panel === 'pages'
                        ? 'Pages'
                        : panel === 'ai'
                          ? 'Build with AI'
                          : panel === 'history'
                            ? 'History'
                            : 'Design'}
                </h2>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {panel === 'add' && <BlockLibrary />}
                {panel === 'layers' && <LayersPanel />}
                {panel === 'pages' && createPage && (
                  <PagesPanel createPage={createPage} />
                )}
                {panel === 'design' && saveThemeAndMark && (
                  <DesignPanel save={saveThemeAndMark} />
                )}
                {site && (
                  <div hidden={panel !== 'ai'}>
                    <AiPanel saveTheme={saveThemeAndMark || undefined} />
                  </div>
                )}
                {panel === 'history' && <HistoryPanel />}
                {/* Opened from the canvas toolbar and the library, which come
                    and go; drawn from here, where nothing unmounts them. */}
                <SavedBlockDialogs />
              </div>
            </aside>

            <main className="min-w-0 flex-1 overflow-hidden">
              <Canvas canvasSrc={canvasSrc} offersRevision={offersRevision} />
            </main>

            <aside className="bg-card flex w-80 shrink-0 flex-col overflow-hidden border-l">
              {delivery ? (
                <Tabs
                  defaultValue="section"
                  className="flex min-h-0 flex-1 flex-col gap-0"
                >
                  <TabsList className="mx-3 mt-3">
                    <TabsTrigger value="section">Selected</TabsTrigger>
                    <TabsTrigger value="delivery">
                      Delivery & offers
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="section"
                    className="min-h-0 flex-1 overflow-y-auto p-3"
                  >
                    <SelectionPanel />
                  </TabsContent>
                  <TabsContent
                    value="delivery"
                    className="min-h-0 flex-1 overflow-y-auto p-3"
                  >
                    <DeliveryPanel
                      {...delivery}
                      onChange={() =>
                        setOffersRevision((revision) => revision + 1)
                      }
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex-1 overflow-y-auto p-3">
                  <SelectionPanel />
                </div>
              )}
            </aside>
          </div>
        </div>
      </ProductCatalogProvider>
    </BuilderSiteProvider>
  )
}

/**
 * The settings of what is selected — or, with nothing selected, how to start.
 *
 * An empty panel that says "select a section" is a dead end to someone who
 * does not yet know what a section is. This one says what to click.
 */
function SelectionPanel() {
  const selectedSectionId = useBuilderStore((s) => s.selectedSectionId)
  if (selectedSectionId) return <InspectorPanel />
  return (
    <div className="flex flex-col gap-4 px-2 py-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Edit anything by clicking it</h3>
        <p className="text-muted-foreground text-sm">
          Your settings appear here when you choose something on the page.
        </p>
      </div>
      <ul className="flex flex-col gap-3 text-sm">
        <Tip icon={MousePointerClick}>
          <b>Click</b> a block, a photo or a button to change it.
        </Tip>
        <Tip icon={Type}>
          <b>Double-click</b> any text to type over it.
        </Tip>
        <Tip icon={Plus}>
          <b>Drag a block</b> from Add onto the page, or use the{' '}
          <span className="bg-primary text-primary-foreground inline-flex size-4 items-center justify-center rounded-full align-[-2px]">
            <Plus className="size-3" />
          </span>{' '}
          between blocks.
        </Tip>
        <Tip icon={Paintbrush}>
          Change colours, fonts and your logo under <b>Design</b>.
        </Tip>
      </ul>
    </div>
  )
}

function Tip({
  icon: Icon,
  children,
}: {
  icon: typeof Plus
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <span className="pt-1">{children}</span>
    </li>
  )
}

/** The page's name, and on a store a menu of the other pages to jump to. */
function PageSwitcher({ title }: { title: string }) {
  const router = useRouter()
  const site = useBuilderSite()
  if (!site || site.kind !== 'STORE') {
    return (
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-muted-foreground truncate text-[11px]">
          {site?.storeName}
        </span>
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>
    )
  }
  const label = (page: BuilderSite['pages'][number]) =>
    page.role === 'PRODUCT'
      ? 'Product page'
      : page.role === 'CATALOG'
        ? 'Category page'
        : page.isHome
          ? 'Home'
          : page.title
  const current = site.pages.find((page) => page.id === site.pageId)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-muted flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left transition outline-none">
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-muted-foreground truncate text-[11px]">
            {site.storeName}
          </span>
          <span className="truncate text-sm font-semibold">
            {current ? label(current) : title}
          </span>
        </span>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your pages</DropdownMenuLabel>
          {site.pages
            .filter((page) => page.role === 'STANDARD')
            .map((page) => (
              <DropdownMenuItem
                key={page.id}
                onClick={() =>
                  router.push(`/stores/${site.storeId}/pages/${page.id}/edit`)
                }
              >
                {label(page)}
                {page.id === site.pageId && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Shop pages</DropdownMenuLabel>
          {site.pages
            .filter((page) => page.role !== 'STANDARD')
            .map((page) => (
              <DropdownMenuItem
                key={page.id}
                onClick={() =>
                  router.push(`/stores/${site.storeId}/pages/${page.id}/edit`)
                }
              >
                {label(page)}
                {page.id === site.pageId && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SaveStatusIndicator({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'text-muted-foreground flex w-24 items-center gap-1.5 text-xs',
        (status === 'error' || status === 'conflict') && 'text-destructive'
      )}
    >
      {status === 'saving' && <Loader2 className="size-3.5 animate-spin" />}
      {status === 'saved' && <Check className="size-3.5" />}
      {status === 'saving' && 'Saving…'}
      {status === 'saved' && 'Draft saved'}
      {status === 'error' && 'Save failed'}
      {status === 'conflict' && 'Not saved'}
      {status === 'idle' && 'All saved'}
    </span>
  )
}
