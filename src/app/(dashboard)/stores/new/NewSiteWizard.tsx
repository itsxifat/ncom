'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  LayoutTemplate,
  Loader2,
  MessagesSquare,
  Monitor,
  PanelTop,
  RotateCcw,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
} from 'lucide-react'
import { createStoreAction } from '@/app/(dashboard)/stores/actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { slugify } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DesignIssues } from '@/components/design/design-issues'
import {
  AiSiteDesigner,
  PasteSiteDesigner,
  type SiteDraftSummary,
} from './DesignWithAi'

export interface TemplateSummary {
  key: string
  kind: 'LANDING' | 'STORE'
  name: string
  description: string
  bestFor: string
  colors: string[]
  blank: boolean
}

type Kind = TemplateSummary['kind']
type Step = 'kind' | 'design' | 'details'
type Language = 'en' | 'bn'
type DesignSource = 'templates' | 'ai' | 'paste'

const LANGUAGES: { value: Language; label: string; hint: string }[] = [
  { value: 'en', label: 'English', hint: 'Your site’s words in English' },
  { value: 'bn', label: 'বাংলা', hint: 'Your site’s words in Bangla' },
]

const CURRENCIES = [
  { code: 'BDT', label: 'Bangladeshi Taka (৳)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'PKR', label: 'Pakistani Rupee (Rs)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'MYR', label: 'Malaysian Ringgit (RM)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
]

const KINDS: {
  kind: Kind
  title: string
  tagline: string
  points: string[]
  icon: typeof Store
}[] = [
  {
    kind: 'LANDING',
    title: 'Landing page',
    tagline: 'One page that sells one product, a combo or a single category.',
    points: [
      'Order form right on the page — name, phone, address, done',
      'Offers, combos and delivery charges per page',
      'Ready in minutes; perfect for Facebook ads',
    ],
    icon: PanelTop,
  },
  {
    kind: 'STORE',
    title: 'Online store',
    tagline: 'A full shop for everything you sell.',
    points: [
      'Home page, categories and a page for every product',
      'Cart, checkout and customer accounts',
      'Banners, sliders and product grids you arrange yourself',
    ],
    icon: Store,
  },
]

/**
 * Making a site in three steps a first-time merchant can follow without help:
 * what are you building, which design do you like, what is it called.
 *
 * Every design is shown as itself — a live, scaled-down page with sample
 * products — rather than as a name and a screenshot that might drift from the
 * real thing. Choosing one makes a complete site from it and opens the
 * builder on its home page.
 */
export function NewSiteWizard({
  rootDomain,
  templates,
  askCurrency,
  initialKind,
  aiAvailable,
}: {
  rootDomain: string
  templates: TemplateSummary[]
  askCurrency: boolean
  initialKind: Kind | null
  /** Whether this installation has the AI builder switched on. */
  aiAvailable: boolean
}) {
  const [step, setStep] = useState<Step>(initialKind ? 'design' : 'kind')
  const [kind, setKind] = useState<Kind>(initialKind ?? 'LANDING')
  const [language, setLanguage] = useState<Language>('en')
  const [source, setSource] = useState<DesignSource>('templates')
  const [templateKey, setTemplateKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<SiteDraftSummary | null>(null)
  // The draft the merchant chose, kept apart from `draft`: an AI design still
  // running in the background, or a second paste, replaces `draft` when it
  // lands, and must not swap out the design already chosen on the Name step.
  const [chosenDraft, setChosenDraft] = useState<SiteDraftSummary | null>(null)
  // An AI design under way, which keeps going while the merchant looks at
  // another tab (see where AiSiteDesigner is drawn).
  const [designing, setDesigning] = useState(false)
  const [previewing, setPreviewing] = useState<TemplateSummary | null>(null)
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [state, action, pending] = useActionState(createStoreAction, undefined)

  const options = templates.filter((template) => template.kind === kind)
  const draftSummary = draft ? summarizeDraft(draft, kind) : null
  const chosen = templateKey?.startsWith('draft-')
    ? chosenDraft && summarizeDraft(chosenDraft, kind)
    : templates.find((template) => template.key === templateKey)
  // A draft is made in the language it was designed in, whatever the picker
  // was set to afterwards — so that is the language to promise and to send.
  const siteLanguage =
    templateKey?.startsWith('draft-') && chosenDraft
      ? chosenDraft.language
      : language
  const showingDraft = Boolean(draft && draftSummary && source !== 'templates')

  function choose(key: string) {
    setTemplateKey(key)
    setPreviewing(null)
    setStep('details')
  }

  function chooseDraft() {
    if (!draft || !draftSummary) return
    if (draft.suggestedName && !name) {
      setName(draft.suggestedName)
      if (!subdomainTouched) setSubdomain(slugify(draft.suggestedName))
    }
    setChosenDraft(draft)
    choose(draftSummary.key)
  }

  function changeKind(next: Kind) {
    // The same kind again changes nothing. Clearing here threw away an AI
    // design that finished while the merchant was looking back at this step.
    if (next === kind) return
    setKind(next)
    setTemplateKey(null)
    setDraft(null)
    setChosenDraft(null)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 py-2 sm:py-6">
      <div className="flex flex-col gap-4">
        <Link
          href="/stores"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4" />
          All websites
        </Link>
        <Steps step={step} />
      </div>

      {step === 'kind' && (
        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              What would you like to build?
            </h1>
            <p className="text-muted-foreground">
              You can make more of either later. Both use the same products and
              orders.
            </p>
          </header>
          <LanguagePicker value={language} onChange={setLanguage} />
          <div className="grid gap-4 md:grid-cols-2">
            {KINDS.map((option) => {
              const Icon = option.icon
              const active = kind === option.kind
              return (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => {
                    changeKind(option.kind)
                    setStep('design')
                  }}
                  className={cn(
                    'group bg-card ring-border hover:ring-foreground/30 flex flex-col gap-5 rounded-2xl p-6 text-left ring-1 transition sm:p-7',
                    active && 'ring-foreground ring-2'
                  )}
                >
                  <KindArt kind={option.kind} />
                  <div className="flex items-start gap-3">
                    <span className="bg-lime text-ink flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <Icon className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-lg font-semibold">
                        {option.title}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {option.tagline}
                      </span>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {option.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <span className="text-foreground mt-auto inline-flex items-center gap-1.5 text-sm font-semibold">
                    Choose a design
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {step === 'design' && (
        <section className="flex flex-col gap-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Pick a design for your{' '}
                {kind === 'STORE' ? 'online store' : 'landing page'}
              </h1>
              <p className="text-muted-foreground">
                Everything — colours, fonts, text, photos, the order of sections
                — can be changed afterwards.
              </p>
            </div>
            <Button variant="outline" onClick={() => setStep('kind')}>
              <ArrowLeft />
              {kind === 'STORE'
                ? 'Make a landing page instead'
                : 'Make an online store instead'}
            </Button>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={source}
              onValueChange={(value) => setSource(value as DesignSource)}
            >
              <TabsList className="h-auto! flex-wrap">
                <TabsTrigger value="templates" className="px-3 py-1.5">
                  <LayoutTemplate />
                  Ready-made designs
                </TabsTrigger>
                {/* Only where the platform offers it: a merchant is never
                    shown an AI builder they cannot use. */}
                {aiAvailable && (
                  <TabsTrigger value="ai" className="px-3 py-1.5">
                    {designing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    Build with AI
                    {/* Finished while the merchant was looking at the designs. */}
                    {draft?.source === 'ai' && source === 'templates' && (
                      <span className="bg-lime size-2 rounded-full">
                        <span className="sr-only">: your design is ready</span>
                      </span>
                    )}
                  </TabsTrigger>
                )}
                <TabsTrigger value="paste" className="px-3 py-1.5">
                  <MessagesSquare />
                  Use your own AI
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {draft && showingDraft ? (
              // The draft is already made in one language; a picker here
              // would only seem to change it.
              <p className="text-muted-foreground text-sm">
                Designed in{' '}
                <span className="text-foreground font-medium">
                  {draft.language === 'bn' ? 'Bangla' : 'English'}
                </span>
                .{' '}
                {draft.language === 'bn'
                  ? 'To make it in English'
                  : 'To make it in Bangla'}
                , choose{' '}
                {draft.source === 'ai'
                  ? 'Try again'
                  : 'Paste a different answer'}
                .
              </p>
            ) : (
              <LanguagePicker value={language} onChange={setLanguage} compact />
            )}
          </div>

          {draft && draftSummary && showingDraft ? (
            <DraftResult
              draft={draft}
              summary={draftSummary}
              onPreview={() => setPreviewing(draftSummary)}
              onChoose={chooseDraft}
              onDiscard={() => setDraft(null)}
            />
          ) : source === 'ai' ? null : source === 'paste' ? (
            <PasteSiteDesigner
              kind={kind}
              language={language}
              onDraft={setDraft}
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((template) => (
                <TemplateCard
                  key={template.key}
                  template={template}
                  language={language}
                  onPreview={() => setPreviewing(template)}
                  onChoose={() => choose(template.key)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/*
        Drawn whatever the step and tab, and hidden unless it is the one
        showing. It owns a design that takes a minute or two, and unmounting it
        stops the design (see useAiDesign): a look at the ready-made designs
        while it ran threw away a design already paid for in credits. Only a
        different kind of site starts it over — that design no longer fits.
      */}
      {aiAvailable && (
        <div
          hidden={!(step === 'design' && source === 'ai' && !showingDraft)}
          className="-mt-2"
        >
          <AiSiteDesigner
            key={kind}
            kind={kind}
            language={language}
            onDraft={setDraft}
            onRunningChange={setDesigning}
          />
        </div>
      )}

      {step === 'details' && chosen && (
        <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <header className="flex flex-col gap-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Name your {kind === 'STORE' ? 'store' : 'page'}
            </h1>
            <p className="text-muted-foreground">
              Using{' '}
              {chosen.key.startsWith('draft-') ? (
                <span className="text-foreground font-medium">
                  {chosen.name.toLowerCase()}
                </span>
              ) : (
                <>
                  the{' '}
                  <span className="text-foreground font-medium">
                    {chosen.name}
                  </span>{' '}
                  design
                </>
              )}
              , in {siteLanguage === 'bn' ? 'Bangla' : 'English'}.{' '}
              <button
                type="button"
                onClick={() => setStep('design')}
                className="text-foreground font-medium underline underline-offset-4"
              >
                Change
              </button>
            </p>
          </header>

          <form
            action={action}
            className="bg-card ring-border rounded-2xl p-6 ring-1"
          >
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="language" value={siteLanguage} />
            {chosen.key.startsWith('draft-') ? (
              <input
                type="hidden"
                name="draftId"
                value={chosen.key.slice('draft-'.length)}
              />
            ) : (
              <input type="hidden" name="templateKey" value={chosen.key} />
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">
                  {kind === 'STORE' ? 'Store name' : 'Page name'}
                </FieldLabel>
                <Input
                  id="name"
                  name="name"
                  required
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (!subdomainTouched)
                      setSubdomain(slugify(event.target.value))
                  }}
                  placeholder={
                    kind === 'STORE'
                      ? 'Rang Fashion House'
                      : 'Eid Panjabi Offer'
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subdomain">Web address</FieldLabel>
                <div className="flex items-center">
                  <Input
                    id="subdomain"
                    name="subdomain"
                    value={subdomain}
                    onChange={(event) => {
                      setSubdomainTouched(true)
                      // Not `slugify`: that trims a trailing hyphen, which
                      // would make "my-shop" impossible to type one key at a
                      // time. The server checks the finished address.
                      setSubdomain(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]+/g, '-')
                          .replace(/-{2,}/g, '-')
                          .replace(/^-/, '')
                          .slice(0, 63)
                      )
                    }}
                    placeholder="your-shop"
                    className="rounded-r-none"
                  />
                  <span className="bg-muted text-muted-foreground border-input flex h-10 shrink-0 items-center rounded-r-lg border border-l-0 px-3 text-sm">
                    .{rootDomain}
                  </span>
                </div>
                <FieldDescription>
                  You can connect your own domain (like yourshop.com) later.
                </FieldDescription>
              </Field>
              {askCurrency && (
                <Field>
                  <FieldLabel htmlFor="currencyCode">
                    Currency you sell in
                  </FieldLabel>
                  <FormSelect
                    id="currencyCode"
                    name="currencyCode"
                    defaultValue="BDT"
                  >
                    {CURRENCIES.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.label}
                      </option>
                    ))}
                  </FormSelect>
                  <FieldDescription>
                    Every order is recorded in it, so it is fixed once you make
                    your first sale.
                  </FieldDescription>
                </Field>
              )}
              {state?.error && <FieldError>{state.error}</FieldError>}
              <Button
                type="submit"
                size="lg"
                disabled={pending || !name.trim()}
              >
                {pending ? 'Building your site…' : 'Create and start editing'}
                {!pending && <ArrowRight />}
              </Button>
            </FieldGroup>
          </form>
        </section>
      )}

      <PreviewDialog
        template={previewing}
        language={language}
        onClose={() => setPreviewing(null)}
        onChoose={() =>
          previewing?.key.startsWith('draft-')
            ? chooseDraft()
            : previewing && choose(previewing.key)
        }
      />
    </div>
  )
}

function Steps({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'kind', label: 'Type' },
    { key: 'design', label: 'Design' },
    { key: 'details', label: 'Name' },
  ]
  const at = steps.findIndex((entry) => entry.key === step)
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Steps">
      {steps.map((entry, index) => (
        <li key={entry.key} className="flex items-center gap-2">
          <span
            aria-current={index === at ? 'step' : undefined}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
              index < at
                ? 'bg-foreground text-background'
                : index === at
                  ? 'bg-lime text-ink'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {index < at ? <Check className="size-3.5" /> : index + 1}
          </span>
          <span
            className={cn(
              index === at ? 'font-semibold' : 'text-muted-foreground'
            )}
          >
            {entry.label}
          </span>
          {index < steps.length - 1 && (
            <span className="bg-border mx-1 h-px w-6 sm:w-10" />
          )}
        </li>
      ))}
    </ol>
  )
}

/** A small drawing of each kind of site, so the choice reads at a glance. */
function KindArt({ kind }: { kind: Kind }) {
  if (kind === 'LANDING') {
    return (
      <div className="bg-muted flex h-36 flex-col gap-2 overflow-hidden rounded-xl p-4">
        <div className="bg-foreground/80 h-3 w-1/2 rounded" />
        <div className="bg-foreground/20 h-2 w-3/4 rounded" />
        <div className="bg-lime mt-1 h-6 w-28 rounded-md" />
        <div className="mt-auto grid grid-cols-[1fr_1.2fr] gap-2">
          <div className="bg-foreground/10 h-12 rounded-md" />
          <div className="bg-card ring-border flex flex-col gap-1.5 rounded-md p-2 ring-1">
            <div className="bg-foreground/15 h-1.5 rounded" />
            <div className="bg-foreground/15 h-1.5 rounded" />
            <div className="bg-foreground/70 mt-auto h-2.5 rounded" />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-muted flex h-36 flex-col gap-2 overflow-hidden rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="bg-foreground/80 h-2.5 w-16 rounded" />
        <ShoppingBag className="text-foreground/60 size-3.5" />
      </div>
      <div className="bg-lime/70 h-10 rounded-md" />
      <div className="grid flex-1 grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-1">
            <div className="bg-foreground/15 flex-1 rounded" />
            <div className="bg-foreground/25 h-1.5 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A page drawn at desktop size and scaled to fit its box.
 *
 * Scaled rather than shrunk because the template's own breakpoints decide its
 * layout: a 1280-pixel page squeezed into a 400-pixel iframe would honestly
 * report a phone and show the phone layout as the desktop thumbnail.
 */
function ScaledFrame({
  src,
  width = 1280,
  height = 960,
  title,
  interactive = false,
}: {
  src: string
  width?: number
  height?: number
  title: string
  interactive?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)

  useEffect(() => {
    const node = box.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [width])

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden"
      style={{ height: height * scale }}
    >
      <iframe
        src={src}
        title={title}
        loading="lazy"
        tabIndex={interactive ? 0 : -1}
        aria-hidden={!interactive}
        // A thumbnail is a picture of the page, not a page to scroll.
        scrolling={interactive ? undefined : 'no'}
        className={cn(
          'absolute top-0 left-0 origin-top-left border-0 bg-white',
          !interactive && 'pointer-events-none'
        )}
        style={{ width, height, transform: `scale(${scale})` }}
      />
    </div>
  )
}

function TemplateCard({
  template,
  language,
  onPreview,
  onChoose,
}: {
  template: TemplateSummary
  language: Language
  onPreview: () => void
  onChoose: () => void
}) {
  return (
    <article className="group bg-card ring-border hover:ring-foreground/25 flex flex-col overflow-hidden rounded-2xl ring-1 transition">
      <button
        type="button"
        onClick={onChoose}
        className="bg-muted relative block overflow-hidden text-left"
        aria-label={`Use the ${template.name} design`}
      >
        {template.blank ? (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3">
            <LayoutTemplate className="text-muted-foreground size-9" />
            <span className="text-muted-foreground text-sm">
              Start with the basics
            </span>
          </div>
        ) : (
          <div className="aspect-[4/3] overflow-hidden">
            <ScaledFrame
              src={previewSrc(template.key, language)}
              title={`${template.name} design`}
            />
          </div>
        )}
        <span className="bg-foreground/0 group-hover:bg-foreground/5 absolute inset-0 transition" />
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">{template.name}</h2>
            <p className="text-muted-foreground text-sm">{template.bestFor}</p>
          </div>
          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
            {template.colors.slice(0, 3).map((color, index) => (
              <span
                key={index}
                className="ring-card size-5 rounded-full ring-2"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">{template.description}</p>
        <div className="mt-auto flex gap-2 pt-1">
          {!template.blank && (
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye />
              Preview
            </Button>
          )}
          <Button size="sm" onClick={onChoose}>
            Use this design
          </Button>
        </div>
      </div>
    </article>
  )
}

function PreviewDialog({
  template,
  language,
  onClose,
  onChoose,
}: {
  template: TemplateSummary | null
  language: Language
  onClose: () => void
  onChoose: () => void
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [page, setPage] = useState<'home' | 'product' | 'catalog'>('home')

  const src = template ? previewSrc(template.key, language, page) : ''

  return (
    <Dialog
      open={Boolean(template)}
      onOpenChange={(open) => {
        if (open) return
        // The next template opens on its home page, not on whichever page
        // the last one was left on.
        setPage('home')
        onClose()
      }}
    >
      <DialogContent className="flex h-[92svh] flex-col gap-0 p-0 sm:h-[90svh] sm:max-w-[min(96vw,1400px)]">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 pr-12">
          <DialogTitle className="text-base font-semibold">
            {template?.name}
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {template?.bestFor}
            </span>
          </DialogTitle>
          <div className="ml-auto flex items-center gap-2">
            {template?.kind === 'STORE' && (
              <div className="bg-muted flex rounded-lg p-0.5 text-sm">
                {(
                  [
                    ['home', 'Home'],
                    ['product', 'Product page'],
                    ['catalog', 'Category page'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPage(value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 font-medium transition',
                      page === value
                        ? 'bg-card shadow-sm'
                        : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="bg-muted hidden rounded-lg p-0.5 sm:flex">
              <Button
                variant={device === 'desktop' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setDevice('desktop')}
                title="Computer"
              >
                <Monitor />
              </Button>
              <Button
                variant={device === 'mobile' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setDevice('mobile')}
                title="Phone"
              >
                <Smartphone />
              </Button>
            </div>
            <Button size="sm" onClick={onChoose}>
              Use this design
            </Button>
          </div>
        </div>
        <div className="bg-muted min-h-0 flex-1 overflow-hidden p-3 sm:p-5">
          {template && (
            <iframe
              key={`${src}-${device}`}
              src={src}
              title={`${template.name} preview`}
              className={cn(
                'mx-auto h-full rounded-lg border bg-white shadow-sm',
                device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
              )}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A design made for this merchant, shown like a gallery template. */
function summarizeDraft(draft: SiteDraftSummary, kind: Kind): TemplateSummary {
  return {
    key: `draft-${draft.id}`,
    kind,
    name: draft.source === 'ai' ? 'Your AI design' : 'Your design',
    description: 'Made for your business.',
    bestFor: draft.source === 'ai' ? 'Designed by AI' : 'From your AI',
    colors: [],
    blank: false,
  }
}

/**
 * Where a design's preview is drawn: a gallery template in the chosen
 * language, or a draft (which knows its own language).
 */
function previewSrc(
  key: string,
  language: Language,
  page: 'home' | 'product' | 'catalog' = 'home'
): string {
  const query = new URLSearchParams()
  if (page !== 'home') query.set('page', page)
  if (!key.startsWith('draft-') && language !== 'en')
    query.set('lang', language)
  const search = query.toString()
  return `/template-preview/${key}${search ? `?${search}` : ''}`
}

/** English or Bangla: the words the merchant's customers will read. */
function LanguagePicker({
  value,
  onChange,
  compact = false,
}: {
  value: Language
  onChange: (language: Language) => void
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        !compact && 'bg-card ring-border rounded-2xl p-4 ring-1'
      )}
    >
      {!compact && (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">
            Which language do your customers read?
          </span>
          <span className="text-muted-foreground text-xs">
            Designs, buttons and the checkout will be in this language. You can
            change it later.
          </span>
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="Website language"
        className="bg-muted flex rounded-lg p-0.5"
      >
        {LANGUAGES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-sm font-medium transition',
              value === option.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A design made for this merchant, shown before anything is created. */
function DraftResult({
  draft,
  summary,
  onPreview,
  onChoose,
  onDiscard,
}: {
  draft: SiteDraftSummary
  summary: TemplateSummary
  onPreview: () => void
  onChoose: () => void
  onDiscard: () => void
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <button
        type="button"
        onClick={onPreview}
        className="bg-muted ring-border overflow-hidden rounded-2xl text-left ring-1"
        aria-label="Preview your design full size"
      >
        <div className="aspect-[4/3] overflow-hidden">
          <ScaledFrame
            src={previewSrc(summary.key, 'en')}
            title="Your design"
          />
        </div>
      </button>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold">
            {draft.source === 'ai'
              ? 'Here’s your design'
              : 'Your AI’s design, ready on NCOM'}
          </h2>
          <p className="text-muted-foreground text-sm">
            Every part is an ordinary block: after you create the site, change
            any word, colour or photo, and drag sections around.
          </p>
        </div>
        <DesignIssues issues={draft.issues} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={onChoose}>
            Use this design
            <ArrowRight />
          </Button>
          <Button variant="outline" onClick={onPreview}>
            <Eye />
            Preview
          </Button>
          <Button variant="ghost" onClick={onDiscard}>
            <RotateCcw />
            {draft.source === 'ai' ? 'Try again' : 'Paste a different answer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
