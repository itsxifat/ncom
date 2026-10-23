'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/components/ui/field'
import { CopyPromptButton } from '@/components/design/copy-prompt'
import { progressLabel, useAiDesign } from '@/components/design/use-ai-design'
import {
  AiCreditsNote,
  canAfford,
  useAiBuilderStatus,
} from '@/components/design/ai-credits'
import {
  readPastedSiteAction,
  sitePromptAction,
} from '@/app/(dashboard)/stores/design-actions'
import type { DesignIssue } from '@/modules/sitespec/normalize'
import { cn } from '@/lib/utils'

type Kind = 'LANDING' | 'STORE'
type Language = 'en' | 'bn'

export interface SiteDraftSummary {
  id: string
  suggestedName: string | null
  issues: DesignIssue[]
  source: 'ai' | 'pasted'
  /**
   * The language it was designed in — the one sent with the request, which
   * the server saved with the draft. The site is made in this language
   * whatever the picker says now, so this is what the wizard shows.
   */
  language: Language
}

/** Starting points a merchant can tap instead of facing an empty box. */
const EXAMPLES: Record<Kind, Record<Language, string[]>> = {
  LANDING: {
    en: [
      'Eid panjabi offer: premium cotton, sizes M to XXL, cash on delivery all over Bangladesh',
      'Herbal hair oil for hair fall, 200 ml bottle, combo of 2 at a lower price',
      'Smart watch launch for students, 7-day replacement warranty',
    ],
    bn: [
      'ঈদ পাঞ্জাবি অফার: প্রিমিয়াম কটন, M থেকে XXL সাইজ, সারা বাংলাদেশে ক্যাশ অন ডেলিভারি',
      'চুল পড়া রোধে হারবাল হেয়ার অয়েল, ২০০ মি.লি., ২টির কম্বো অফার',
      'শিক্ষার্থীদের জন্য স্মার্ট ওয়াচ, ৭ দিনের রিপ্লেসমেন্ট ওয়ারেন্টি',
    ],
  },
  STORE: {
    en: [
      'Women’s fashion shop: sarees, three-pieces and kurtis for everyday and festivals',
      'Gadget and phone accessories store for young buyers in Dhaka',
      'Organic food shop: honey, ghee, dates and mustard oil, direct from farms',
    ],
    bn: [
      'মেয়েদের ফ্যাশন শপ: শাড়ি, থ্রি-পিস আর কুর্তি — প্রতিদিন আর উৎসবের জন্য',
      'তরুণদের জন্য গ্যাজেট আর মোবাইল এক্সেসরিজের দোকান',
      'অর্গানিক খাবারের দোকান: মধু, ঘি, খেজুর আর সরিষার তেল, সরাসরি খামার থেকে',
    ],
  },
}

const STYLES = [
  'Clean and minimal',
  'Bold and colourful',
  'Elegant and premium',
  'Friendly and playful',
]

/**
 * Describe the business, get a whole site.
 *
 * The merchant writes in their own words — Bangla or English, a sentence or a
 * page — and Claude designs the site from NCOM's own blocks. The result is a
 * draft they preview before anything is created. It is paid for in the
 * workspace's AI credits, which the button says before it is pressed.
 */
export function AiSiteDesigner({
  kind,
  language,
  onDraft,
  onRunningChange,
}: {
  kind: Kind
  language: Language
  onDraft: (draft: SiteDraftSummary) => void
  /** Told when a design starts and stops, for the wizard around it. */
  onRunningChange?: (running: boolean) => void
}) {
  const [request, setRequest] = useState('')
  const [style, setStyle] = useState<string | null>(null)
  // The language of the design under way. The picker stays free while it
  // runs, but changing it does not change a request already sent.
  const [sentIn, setSentIn] = useState<Language | null>(null)
  const { state, run, cancel } = useAiDesign<{
    draftId: string
    suggestedName: string | null
    issues: DesignIssue[]
  }>()
  const running = state.status === 'running'
  const { status, refresh } = useAiBuilderStatus()
  const cost = status?.costs.site ?? 0

  useEffect(() => {
    onRunningChange?.(running)
  }, [running, onRunningChange])

  async function design() {
    const designIn = language
    setSentIn(designIn)
    const done = await run({
      mode: 'site',
      kind,
      language: designIn,
      request: style
        ? `${request.trim()}\n\nThe look: ${style.toLowerCase()}.`
        : request.trim(),
    })
    // Paid for, or given back: either way the balance on screen is stale.
    refresh()
    if (done) {
      onDraft({
        id: done.draftId,
        suggestedName: done.suggestedName,
        issues: done.issues,
        source: 'ai',
        language: designIn,
      })
    }
  }
  const siteLanguage = running && sentIn ? sentIn : language

  return (
    <div className="bg-card ring-border flex flex-col gap-5 rounded-2xl p-5 ring-1 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5" />
          Tell us about your business
        </h2>
        <p className="text-muted-foreground text-sm">
          What you sell, who buys it, any offer you’re running. Write in Bangla
          or English — the site will be in{' '}
          {siteLanguage === 'bn' ? 'Bangla' : 'English'}.
        </p>
      </div>

      <Textarea
        value={request}
        onChange={(event) => setRequest(event.target.value)}
        placeholder={EXAMPLES[kind][language][0]}
        rows={4}
        maxLength={4000}
        disabled={running}
        className="min-h-28 text-base"
        lang={language}
      />

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          Or start from an example
        </span>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES[kind][language].map((example) => (
            <button
              key={example}
              type="button"
              disabled={running}
              onClick={() => setRequest(example)}
              className="bg-muted hover:bg-muted/70 max-w-full truncate rounded-full px-3 py-1.5 text-left text-xs transition"
              lang={language}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          The look (optional)
        </span>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((option) => (
            <button
              key={option}
              type="button"
              disabled={running}
              aria-pressed={style === option}
              onClick={() => setStyle(style === option ? null : option)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition',
                style === option
                  ? 'bg-foreground text-background ring-foreground'
                  : 'ring-border hover:ring-foreground/30'
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'error' && <FieldError>{state.message}</FieldError>}

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <>
            <Button disabled size="lg">
              <Loader2 className="animate-spin" />
              {progressLabel(state.sections, 'site')}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Stop
            </Button>
            <span className="text-muted-foreground text-xs">
              A whole {kind === 'STORE' ? 'store' : 'page'} takes a minute or
              two.
            </span>
          </>
        ) : (
          <Button
            size="lg"
            onClick={design}
            disabled={request.trim().length < 3 || !canAfford(status, cost)}
          >
            <Sparkles />
            Design my {kind === 'STORE' ? 'store' : 'page'}
          </Button>
        )}
        {!running && <AiCreditsNote cost={cost} status={status} />}
      </div>
    </div>
  )
}

/**
 * The same result, with the merchant's own AI doing the writing: copy our
 * prompt into it, paste its answer back.
 */
export function PasteSiteDesigner({
  kind,
  language,
  onDraft,
}: {
  kind: Kind
  language: Language
  onDraft: (draft: SiteDraftSummary) => void
}) {
  const [request, setRequest] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function check() {
    setError(null)
    const designIn = language
    startTransition(async () => {
      const result = await readPastedSiteAction({
        kind,
        language: designIn,
        text: answer,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      onDraft({
        id: result.draftId,
        suggestedName: result.suggestedName,
        issues: result.issues,
        source: 'pasted',
        language: designIn,
      })
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-card ring-border flex flex-col gap-4 rounded-2xl p-5 ring-1 sm:p-6">
        <StepNumber n={1} title="Copy our prompt into your AI" />
        <p className="text-muted-foreground text-sm">
          It tells ChatGPT, Gemini, Claude — any AI — exactly how to design a{' '}
          {kind === 'STORE' ? 'store' : 'landing page'} that works on NCOM.
          Already have a design? Paste its code or a screenshot into the AI too,
          and it will rebuild it here.
        </p>
        <Textarea
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="What you sell and the look you want (optional — you can also tell your AI directly)"
          rows={3}
          maxLength={4000}
          lang={language}
        />
        <CopyPromptButton
          className="self-start"
          getPrompt={() => sitePromptAction({ kind, language, request })}
        />
      </section>

      <section className="bg-card ring-border flex flex-col gap-4 rounded-2xl p-5 ring-1 sm:p-6">
        <StepNumber n={2} title="Paste your AI’s answer here" />
        <Textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={'{ "format": "ncom/site@1", … }'}
          rows={8}
          className="[field-sizing:fixed] min-h-40 font-mono text-xs"
          spellCheck={false}
        />
        {error && <FieldError>{error}</FieldError>}
        <Button
          className="self-start"
          onClick={check}
          disabled={pending || answer.trim().length < 2}
        >
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          See my design
        </Button>
      </section>
    </div>
  )
}

function StepNumber({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-base font-semibold">
      <span className="bg-lime text-ink flex size-6 items-center justify-center rounded-full text-xs font-bold">
        {n}
      </span>
      {title}
    </h2>
  )
}
