'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  Code2,
  Loader2,
  MessagesSquare,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/components/ui/field'
import { CopyPromptButton } from '@/components/design/copy-prompt'
import { DesignIssues } from '@/components/design/design-issues'
import { progressLabel, useAiDesign } from '@/components/design/use-ai-design'
import {
  AiCreditsNote,
  canAfford,
  useAiBuilderStatus,
} from '@/components/design/ai-credits'
import {
  pagePromptAction,
  readPastedPageAction,
} from '@/app/(dashboard)/stores/design-actions'
import type { PageDesignResult } from '@/modules/sitespec/read'
import type {
  DesignIssue,
  NormalizedSection,
} from '@/modules/sitespec/normalize'
import { restyleConfig } from '@/modules/sitespec/style-keys'
import { getSectionDefinition } from '../sections/registry'
import { cn } from '@/lib/utils'
import {
  isLayoutSection,
  resolveSectionId,
  undoEdit,
  useBuilderStore,
  type BuilderSection,
} from './store'
import { useBuilderSite } from './SiteContext'

type Scope = 'page' | 'section'

/**
 * AI in the builder: ask for a change in plain words, or bring a design from
 * the merchant's own AI.
 *
 * Whatever comes back is applied straight onto the canvas as one edit — one
 * Undo puts the page back — rather than behind a confirm step, because seeing
 * the change *is* how a merchant decides whether they like it. Sections the
 * answer kept keep their ids, so their per-element styling and their place in
 * the page's history survive a rewrite.
 */
export function AiPanel() {
  const site = useBuilderSite()
  const selectedId = useBuilderStore((s) => s.selectedSectionId)
  const sections = useBuilderStore((s) => s.sections)
  const selected = sections.find((section) => section.id === selectedId)
  const selectedName = selected
    ? (getSectionDefinition(selected.type)?.name ?? 'section')
    : null

  if (!site) return null

  return (
    <div className="flex flex-col gap-6">
      {/* Only where the platform offers it. Without it, the merchant's own
          AI below does the same job, and nothing says anything is missing. */}
      {site.aiAvailable && (
        <AskAi
          storeId={site.storeId}
          pageId={site.pageId}
          selected={selected && !isLayoutSection(selected) ? selected : null}
          selectedName={selectedName}
        />
      )}
      <OwnAi storeId={site.storeId} pageId={site.pageId} />
      <Link
        href="/settings/ai-editors"
        target="_blank"
        className="bg-muted/60 hover:bg-muted flex items-start gap-3 rounded-xl p-3 text-sm transition"
      >
        <Code2 className="mt-0.5 size-4 shrink-0" />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Build with an AI code editor</span>
          <span className="text-muted-foreground text-xs">
            Connect Cursor, Claude Code, VS Code or Windsurf to this workspace
            and let it build your pages here.
          </span>
        </span>
      </Link>
    </div>
  )
}

/** The page's own sections, in the shape the AI edits. */
function editable(sections: BuilderSection[]) {
  return sections
    .filter((section) => !isLayoutSection(section))
    .map((section) => ({
      id: section.id,
      type: section.type,
      content: section.content,
      config: section.config as Record<string, unknown>,
      isVisible: section.isVisible,
    }))
}

function AskAi({
  storeId,
  pageId,
  selected,
  selectedName,
}: {
  storeId: string
  pageId: string
  selected: BuilderSection | null
  selectedName: string | null
}) {
  const [request, setRequest] = useState('')
  const [scopeChoice, setScope] = useState<Scope>('section')
  const [issues, setIssues] = useState<DesignIssue[] | null>(null)
  const { state, run, cancel } = useAiDesign<{ result: PageDesignResult }>()
  const scope: Scope = selected ? scopeChoice : 'page'
  const running = state.status === 'running'
  const { status, refresh } = useAiBuilderStatus()
  const cost = status?.costs[scope] ?? 0
  const affordable = canAfford(status, cost)

  // A request is about the page it was sent from. The panel now outlives
  // being closed, so switching page from the page menu must stop it, or its
  // answer would be put onto whichever page is open when it lands.
  useEffect(() => cancel, [pageId, cancel])

  const quick =
    scope === 'section'
      ? [
          'Rewrite it to sell better',
          'Translate it into Bangla',
          'Translate it into English',
          'Make it shorter and simpler',
        ]
      : [
          'Write this page for my business',
          'Translate the whole page into Bangla',
          'Translate the whole page into English',
          'Add a FAQ about delivery and payment',
        ]

  async function ask(text: string) {
    const words = text.trim()
    if (words.length < 2 || !affordable) return
    setIssues(null)
    const builder = useBuilderStore.getState()
    const sectionId = scope === 'section' && selected ? selected.id : null
    const target = editable(
      sectionId
        ? builder.sections.filter((section) => section.id === sectionId)
        : builder.sections
    )
    // Told to the whole builder while it runs: the panel can be closed
    // meanwhile, and what the AI is rewriting is replaced when it answers.
    const working = {
      scope: sectionId ? ('section' as const) : ('page' as const),
      sectionId,
    }
    builder.setAiRequest(working)
    let done: { result: PageDesignResult } | null
    try {
      done = await run({
        mode: 'page',
        storeId,
        pageId,
        request: words,
        sections: target,
        scope,
      })
    } finally {
      const { aiRequest, setAiRequest } = useBuilderStore.getState()
      if (aiRequest === working) setAiRequest(null)
      // Paid for, or given back: either way the balance on screen is stale.
      refresh()
    }
    if (!done) return
    if (!done.result.ok) return
    const applied = sectionId
      ? applyDesign(done.result, { section: sectionId })
      : applyDesign(
          done.result,
          'replace',
          target.map((section) => section.id)
        )
    if (!applied) return
    setIssues(done.result.issues)
    // Translating the words does not change the language of NCOM's own
    // words on the site — buttons, the cart, the checkout. Say where that is.
    const siteLanguage = useBuilderStore.getState().theme?.language
    const into = /bangla|বাংলা/i.test(words)
      ? 'bn'
      : /english/i.test(words)
        ? 'en'
        : null
    const mismatch =
      /translat/i.test(words) && into && (siteLanguage ?? 'en') !== into
    toast.success('Done — the change is on your page', {
      description: mismatch
        ? `To show buttons and the checkout in ${into === 'bn' ? 'Bangla' : 'English'} too, change the language under Design.`
        : undefined,
      action: { label: 'Undo', onClick: undoEdit },
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4" />
        Ask AI
      </h3>
      {selected && (
        <div className="bg-muted flex rounded-lg p-0.5 text-xs">
          {(
            [
              ['section', `This ${selectedName?.toLowerCase() ?? 'section'}`],
              ['page', 'Whole page'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={cn(
                'flex-1 truncate rounded-md px-2 py-1.5 font-medium transition',
                scope === value
                  ? 'bg-card shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Textarea
        value={request}
        onChange={(event) => setRequest(event.target.value)}
        placeholder={
          scope === 'section'
            ? 'What should change in this section?'
            : 'What should this page say? Or what should change?'
        }
        rows={3}
        maxLength={4000}
        disabled={running}
      />
      <div className="flex flex-wrap gap-1.5">
        {quick.map((text) => (
          <button
            key={text}
            type="button"
            disabled={running || !affordable}
            onClick={() =>
              text.startsWith('Write this page')
                ? setRequest(
                    request ||
                      'Write this page for my business: [what you sell, who it is for, your offer]'
                  )
                : void ask(text)
            }
            className="bg-muted hover:bg-muted/70 rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50"
          >
            {text}
          </button>
        ))}
      </div>
      {state.status === 'error' && <FieldError>{state.message}</FieldError>}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => void ask(request)}
          disabled={running || request.trim().length < 2 || !affordable}
        >
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {running
            ? progressLabel(
                state.status === 'running' ? state.sections : 0,
                scope === 'section' ? 'section' : 'page'
              )
            : 'Ask AI'}
        </Button>
        {/* Closing the panel no longer stops a request, so this does. */}
        {running && (
          <Button variant="ghost" onClick={cancel}>
            Stop
          </Button>
        )}
      </div>
      {!running && <AiCreditsNote cost={cost} status={status} />}
      {issues && issues.length > 0 && <DesignIssues issues={issues} />}
    </section>
  )
}

function OwnAi({ storeId, pageId }: { storeId: string; pageId: string }) {
  const [request, setRequest] = useState('')
  const [editCurrent, setEditCurrent] = useState(true)
  const [answer, setAnswer] = useState('')
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<DesignIssue[] | null>(null)
  const [pending, startTransition] = useTransition()

  function apply() {
    setError(null)
    setIssues(null)
    startTransition(async () => {
      const result = await readPastedPageAction({
        storeId,
        pageId,
        text: answer,
        partial: mode === 'append',
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (!applyDesign(result, mode)) return
      setIssues(result.issues)
      setAnswer('')
      toast.success('Your AI’s design is on the page', {
        action: {
          label: 'Undo',
          onClick: undoEdit,
        },
      })
    })
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessagesSquare className="size-4" />
        Use your own AI
      </h3>
      <p className="text-muted-foreground text-xs">
        Copy our prompt into ChatGPT, Gemini or Claude, then paste its answer
        below. Have a design already? Give your AI its code or a screenshot too.
      </p>
      <Textarea
        value={request}
        onChange={(event) => setRequest(event.target.value)}
        placeholder="What you want (optional)"
        rows={2}
        maxLength={4000}
      />
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={editCurrent}
          onChange={(event) => setEditCurrent(event.target.checked)}
          className="accent-foreground"
        />
        Include this page, so the AI changes it instead of starting over
      </label>
      <CopyPromptButton
        size="sm"
        className="self-start"
        getPrompt={() =>
          pagePromptAction({
            storeId,
            pageId,
            request,
            sections: editCurrent
              ? editable(useBuilderStore.getState().sections)
              : [],
          })
        }
      />
      <Textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Paste your AI’s answer here"
        rows={4}
        className="[field-sizing:fixed] font-mono text-xs"
        spellCheck={false}
      />
      <div className="bg-muted flex rounded-lg p-0.5 text-xs">
        {(
          [
            ['replace', 'Replace the page'],
            ['append', 'Add to the end'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 font-medium transition',
              mode === value ? 'bg-card shadow-sm' : 'text-muted-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}
      <Button
        variant="outline"
        onClick={apply}
        disabled={pending || answer.trim().length < 2}
      >
        {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        Put it on my page
      </Button>
      {issues && issues.length > 0 && <DesignIssues issues={issues} />}
      {issues && (
        <button
          type="button"
          onClick={undoEdit}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-xs"
        >
          <Undo2 className="size-3.5" />
          Undo
        </button>
      )}
    </section>
  )
}

/**
 * Puts a design onto the page being edited, as one undoable edit.
 *
 * - `replace`: the page becomes the design. A section the design kept (by id,
 *   same block) is updated in place, keeping its per-element styling.
 * - `append`: the design's new sections go after the page's own. One it kept
 *   by id is updated in place instead — an answer to a prompt that included
 *   the page sends the whole page back, and appending all of it put a second
 *   copy of the page under the first.
 * - `{ section }`: the selected section becomes the design's version of it;
 *   any new sections the design added follow it. Nothing else on the page,
 *   the layout included, is touched — the merchant asked about one block.
 *
 * `askedAbout` is the ids of the page's sections when an AI request was sent,
 * for an answer that took a while. A block added since was not in what the AI
 * rewrote and stays where the merchant put it; one deleted since stays gone.
 *
 * Ids are resolved through the saves made meanwhile (`resolveSectionId`): a
 * new block's `temp-` id is replaced by its saved one while a request runs,
 * and an answer about the old id still means that block — missing it put a
 * copy at the bottom of the page instead of rewriting the block.
 *
 * A header, footer or announcement in the design updates the store's own
 * layout block of that kind rather than adding a second one.
 *
 * Answers false, having said why, when there was nothing to apply it to.
 */
function applyDesign(
  design: PageDesignResult,
  mode: 'replace' | 'append' | { section: string },
  askedAbout?: string[]
): boolean {
  const { sections, replaceSections } = useBuilderStore.getState()

  /**
   * A design section as a builder one: `reuse`, when it rewrites a section
   * already on the page, keeps that section's id and what the design cannot
   * see.
   *
   * `sawStyle` says the design was written from that section's own export,
   * whose `style` carries every section style it has. Then the design's style
   * *is* the section's style: one it leaves out was taken off, or "remove the
   * background photo" could never remove it. A layout block matched only by
   * kind was never shown to the AI, so there the design's style goes over the
   * old one instead.
   */
  const toBuilder = (
    section: NormalizedSection,
    reuse: BuilderSection | undefined,
    sawStyle: boolean
  ): BuilderSection =>
    reuse && reuse.type === section.type
      ? {
          ...reuse,
          content: section.content,
          config: sawStyle
            ? restyleConfig(reuse.config, section.config, section.rejectedStyle)
            : { ...reuse.config, ...section.config },
          isVisible: section.isVisible,
        }
      : {
          id: `temp-${crypto.randomUUID()}`,
          type: section.type,
          order: 0,
          content: section.content,
          config: section.config,
          isVisible: section.isVisible,
          scope: 'page',
        }

  const top = sections.filter(
    (section, index) =>
      isLayoutSection(section) && index < firstPageIndex(sections)
  )
  const bottom = sections.filter(
    (section, index) =>
      isLayoutSection(section) && index >= firstPageIndex(sections)
  )
  const page = sections.filter((section) => !isLayoutSection(section))
  const pageById = new Map(page.map((section) => [section.id, section]))
  /** The page section a design section names by id, if it is still there. */
  const named = (section: NormalizedSection) =>
    section.ref ? pageById.get(resolveSectionId(section.ref)) : undefined
  const asked = askedAbout && new Set(askedAbout.map(resolveSectionId))

  // Added to a page that already has its order form (or any other
  // one-per-page block): the page's own copy stays, the design's goes.
  const alreadyHas = (type: string, except?: string) =>
    Boolean(getSectionDefinition(type)?.singleton) &&
    page.some((section) => section.type === type && section.id !== except)

  // Only blocks the reader put in itself (see `added`), with a header or
  // footer beside them: the design said nothing about the page's own blocks,
  // and replacing the page with nothing would empty it.
  const pageUntouched =
    mode === 'replace' &&
    design.layout.length > 0 &&
    design.sections.every((section) => section.added)

  let nextPage: BuilderSection[]
  if (pageUntouched) {
    nextPage = page
  } else if (mode === 'replace') {
    const used = new Set<string>()
    const rewritten: BuilderSection[] = []
    for (const section of design.sections) {
      // A block the reader added because the design left it out — the order
      // form, a product page's details — is the page's own one when it has
      // it: its wording and styling are the merchant's work.
      if (section.added && !section.ref) {
        const own = page.find(
          (candidate) =>
            candidate.type === section.type && !used.has(candidate.id)
        )
        if (own) {
          used.add(own.id)
          rewritten.push(own)
          continue
        }
      }
      const existing = named(section)
      // Deleted while the AI was working: the merchant took it off the page,
      // and the answer is no reason to put it back.
      const ref = section.ref && resolveSectionId(section.ref)
      if (ref && !existing && asked?.has(ref)) continue
      const reuse =
        existing && existing.type === section.type && !used.has(existing.id)
          ? existing
          : undefined
      if (reuse) used.add(reuse.id)
      rewritten.push(toBuilder(section, reuse, true))
    }
    nextPage = asked ? keepAdded(rewritten, page, asked) : rewritten
  } else if (mode === 'append') {
    const updates = new Map<string, NormalizedSection>()
    const fresh: NormalizedSection[] = []
    for (const section of design.sections) {
      const existing = named(section)
      if (
        existing &&
        existing.type === section.type &&
        !updates.has(existing.id)
      ) {
        updates.set(existing.id, section)
      } else if (!alreadyHas(section.type)) {
        fresh.push(section)
      }
    }
    nextPage = [
      ...page.map((section) => {
        const update = updates.get(section.id)
        return update ? toBuilder(update, section, true) : section
      }),
      ...fresh.map((section) => toBuilder(section, undefined, true)),
    ]
  } else {
    const targetId = resolveSectionId(mode.section)
    const at = page.findIndex((section) => section.id === targetId)
    // Deleted while the AI was working. Adding the answer at the bottom
    // instead would be a block nobody asked for.
    if (at === -1) {
      toast.error(
        'That block was removed while the AI was working, so nothing was changed.'
      )
      return false
    }
    const target = page[at]!
    const candidates = design.sections.filter(
      (section) => !alreadyHas(section.type, targetId)
    )
    // The AI's version of the block: the section that kept its id, or failing
    // that the first one it sent.
    const rewrite =
      candidates.find((section) => named(section) === target) ?? candidates[0]
    if (!rewrite) {
      toast.error('The AI’s answer had nothing in it to change. Try again.')
      return false
    }
    // Further sections it added go after the block. One naming another block
    // already on the page would be a second copy of it, and so would a
    // one-per-page block the page has — the target included.
    const extra = candidates.filter(
      (section) =>
        section !== rewrite && !named(section) && !alreadyHas(section.type)
    )
    nextPage = [
      ...page.slice(0, at),
      toBuilder(rewrite, target, true),
      ...extra.map((section) => toBuilder(section, undefined, true)),
      ...page.slice(at + 1),
    ]
  }

  // Layout blocks the design included: update ours of the same kind. Not for
  // an answer about one block, which only that block takes.
  const designLayout = typeof mode === 'object' ? [] : design.layout
  const layout = [...top, ...bottom].map((section) => {
    const incoming = designLayout.find(
      (candidate) => candidate.type === section.type
    )
    return incoming ? toBuilder(incoming, section, false) : section
  })
  const added = designLayout
    .filter(
      (incoming) => !layout.some((section) => section.type === incoming.type)
    )
    .map((incoming) => ({
      ...toBuilder(incoming, undefined, false),
      scope: 'layout' as const,
    }))

  const nextTop = layout.slice(0, top.length)
  const nextBottom = layout.slice(top.length)
  const addedTop = added.filter(
    (section) => getSectionDefinition(section.type)?.placement === 'top'
  )
  const addedBottom = added.filter(
    (section) => getSectionDefinition(section.type)?.placement !== 'top'
  )

  replaceSections([
    ...addedTop.filter((section) => section.type === 'announcement'),
    ...nextTop,
    ...addedTop.filter((section) => section.type !== 'announcement'),
    ...nextPage,
    ...nextBottom,
    ...addedBottom,
  ])
  return true
}

/**
 * `next`, with every block of `page` that is not in `asked` put back after
 * the block it followed — blocks added while the AI was working, which its
 * answer could not have known about.
 */
function keepAdded(
  next: BuilderSection[],
  page: BuilderSection[],
  asked: Set<string>
): BuilderSection[] {
  const result = [...next]
  page.forEach((section, index) => {
    if (asked.has(section.id)) return
    // After the nearest block before it that is still on the page; at the top
    // when there is none.
    let at = 0
    for (let back = index - 1; back >= 0; back--) {
      const found = result.findIndex((s) => s.id === page[back]!.id)
      if (found !== -1) {
        at = found + 1
        break
      }
    }
    result.splice(at, 0, section)
  })
  return result
}

function firstPageIndex(sections: BuilderSection[]): number {
  const index = sections.findIndex((section) => !isLayoutSection(section))
  if (index !== -1) return index
  // A page with no sections of its own: every layout block before the first
  // bottom-placed one counts as "top".
  const bottom = sections.findIndex(
    (section) => getSectionDefinition(section.type)?.placement === 'bottom'
  )
  return bottom === -1 ? sections.length : bottom
}
