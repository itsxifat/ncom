'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Compass,
  Gem,
  Laptop,
  LayoutTemplate,
  Loader2,
  Package,
  PartyPopper,
  Rocket,
  Shirt,
  ShoppingBasket,
  Sofa,
  Sparkles,
  Store,
  Truck,
} from 'lucide-react'
import {
  Field,
  FormAlert,
  StepIndicator,
  TextInput,
} from '@/components/auth/auth-ui'
import { taka } from '@/components/marketing/site/packages'
import {
  SUGGESTED_TEMPLATES,
  TEMPLATE_NAMES,
  type OnboardingCategory,
} from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import {
  finishOnboardingAction,
  saveBusinessAction,
  startOnboardingTrialAction,
} from './actions'

export interface OnboardingPackage {
  id: string
  code: string
  name: string
  tagline: string | null
  monthlyPriceCents: number
  annualPriceCents: number | null
  trialDays: number
  yearlySaving: string | null
  lines: string[]
  badge: string | null
}

type Step = 'business' | 'package' | 'ready'
type Purpose =
  | 'START_SELLING'
  | 'MOVE_EXISTING_STORE'
  | 'BUILD_FOR_CLIENT'
  | 'JUST_EXPLORING'

const CATEGORIES: {
  value: OnboardingCategory
  label: string
  icon: typeof Shirt
}[] = [
  { value: 'fashion', label: 'Clothing', icon: Shirt },
  { value: 'beauty', label: 'Beauty & care', icon: Sparkles },
  { value: 'food', label: 'Food & grocery', icon: ShoppingBasket },
  { value: 'gadgets', label: 'Gadgets', icon: Laptop },
  { value: 'home', label: 'Home & living', icon: Sofa },
  { value: 'other', label: 'Something else', icon: Gem },
]

const PURPOSES: {
  value: Purpose
  title: string
  text: string
  icon: typeof Rocket
}[] = [
  {
    value: 'START_SELLING',
    title: 'Starting to sell online',
    text: 'Your first page or store of your own.',
    icon: Rocket,
  },
  {
    value: 'MOVE_EXISTING_STORE',
    title: 'Moving an existing store',
    text: 'You already sell somewhere else.',
    icon: Truck,
  },
  {
    value: 'BUILD_FOR_CLIENT',
    title: 'Building for a client',
    text: 'An agency or freelancer setting up a shop.',
    icon: Briefcase,
  },
  {
    value: 'JUST_EXPLORING',
    title: 'Just looking around',
    text: 'See what NCOM can do first.',
    icon: Compass,
  },
]

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function OnboardingFlow({
  firstName,
  steps,
  initialStep,
  needsPackage,
  business,
  packages,
  featuredCode,
  trial,
  current,
}: {
  firstName: string | null
  steps: string[]
  initialStep: Step
  /** False when the workspace already has a package (an admin's default). */
  needsPackage: boolean
  business: { name: string; purpose: string | null }
  packages: OnboardingPackage[]
  featuredCode: string
  trial: { selfServe: boolean; eligible: boolean; reason: string | null }
  current: { planName: string; endsAt: string | null } | null
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [name, setName] = useState(business.name)
  const [category, setCategory] = useState<OnboardingCategory | null>(null)
  const [purpose, setPurpose] = useState<Purpose>(
    (business.purpose as Purpose | null) ?? 'START_SELLING'
  )
  const [interval, setBillingInterval] = useState<'MONTHLY' | 'ANNUAL'>(
    'MONTHLY'
  )
  const trialPackages = packages.filter((pkg) => pkg.trialDays > 0)
  const otherPackages = packages.filter((pkg) => pkg.trialDays <= 0)
  const [planId, setPlanId] = useState(
    (trialPackages.find((pkg) => pkg.code === featuredCode) ?? trialPackages[0])
      ?.id ?? ''
  )
  const [started, setStarted] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const businessIndex = steps.indexOf('Your business')
  const packageIndex = steps.indexOf('Choose a package')
  const chosen = trialPackages.find((pkg) => pkg.id === planId)

  function saveBusiness(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await saveBusinessAction({
        businessName: name,
        category: category ?? undefined,
        purpose,
      })
      if (result.error) return setError(result.error)
      setStep(needsPackage ? 'package' : 'ready')
      window.scrollTo({ top: 0 })
    })
  }

  function startTrial() {
    if (!chosen) return
    setError(null)
    startTransition(async () => {
      const result = await startOnboardingTrialAction({
        planId: chosen.id,
        interval,
      })
      if (result.error) return setError(result.error)
      setStarted({
        planName: result.planName ?? chosen.name,
        endsAt: result.trialEndsAt ?? null,
      })
      setStep('ready')
      window.scrollTo({ top: 0 })
    })
  }

  if (step === 'business') {
    return (
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-10 pt-6 sm:pt-12">
        <header className="au-rise flex flex-col gap-4">
          <StepIndicator steps={steps} current={businessIndex} />
          <h1 className="font-display text-[clamp(32px,4.4vw,44px)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance">
            {firstName ? `Welcome, ${firstName}. ` : ''}Tell us about your
            business.
          </h1>
          <p className="text-muted-foreground text-base text-pretty">
            We’ll set up your workspace around it. You can change any of this
            later.
          </p>
        </header>

        <form onSubmit={saveBusiness} className="au-rise-2 flex flex-col gap-9">
          <Field
            label="Business name"
            htmlFor="businessName"
            hint="Shown in your dashboard. Each website can still have its own name."
          >
            <TextInput
              id="businessName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Madhuban Organics"
              autoComplete="organization"
              maxLength={80}
              required
              autoFocus
            />
          </Field>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-medium">
              What do you sell?{' '}
              <span className="text-muted-foreground font-normal">
                — we’ll suggest designs for it
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {CATEGORIES.map((option) => {
                const Icon = option.icon
                const on = category === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCategory(on ? null : option.value)}
                    className={cn(
                      'flex min-h-12 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left text-sm leading-tight font-medium transition-[border-color,background-color,box-shadow]',
                      on
                        ? 'border-foreground bg-foreground/[0.04] ring-foreground/[0.06] ring-4'
                        : 'border-input bg-card hover:border-foreground/30 dark:bg-input/30'
                    )}
                  >
                    <Icon className="text-muted-foreground size-4 shrink-0" />
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-medium">
              Where are you starting from?
            </legend>
            <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup">
              {PURPOSES.map((option) => {
                const Icon = option.icon
                const on = purpose === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPurpose(option.value)}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow]',
                      on
                        ? 'border-foreground bg-foreground/[0.04] ring-foreground/[0.06] ring-4'
                        : 'border-input bg-card hover:border-foreground/30 dark:bg-input/30'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                        on
                          ? 'bg-lime text-lime-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">
                        {option.title}
                      </span>
                      <span className="text-muted-foreground text-[13px]">
                        {option.text}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {error && <FormAlert>{error}</FormAlert>}

          <PrimaryButton pending={pending} disabled={name.trim().length < 2}>
            Continue
          </PrimaryButton>
        </form>
      </div>
    )
  }

  if (step === 'package') {
    const canStart = trial.selfServe && trial.eligible
    return (
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 pt-6 sm:pt-12">
        <header className="au-rise mx-auto flex max-w-[640px] flex-col items-center gap-4 text-center">
          <StepIndicator steps={steps} current={packageIndex} />
          <h1 className="font-display text-[clamp(32px,4.4vw,44px)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance">
            Pick a package. The first 7 days are free.
          </h1>
          <p className="text-muted-foreground text-base text-pretty">
            No payment now. We’ll remind you before the trial ends, and you only
            pay if you stay. You can switch packages any time.
          </p>
          <IntervalSwitch
            value={interval}
            onChange={setBillingInterval}
            yearlyNote={trialPackages[0]?.yearlySaving ?? null}
          />
        </header>

        {!canStart && (
          <div className="mx-auto w-full max-w-[640px]">
            <FormAlert>
              {!trial.selfServe
                ? 'Packages are set up by our team at the moment. Continue to Billing and get in touch — we’ll start your trial.'
                : (trial.reason ??
                  'This workspace can’t start a free trial. Choose a package in Billing to continue.')}
            </FormAlert>
          </div>
        )}

        <div
          role="radiogroup"
          aria-label="Packages"
          className="au-rise-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {trialPackages.map((pkg) => {
            const on = pkg.id === planId
            const annual = interval === 'ANNUAL' && pkg.annualPriceCents
            const price = annual ? pkg.annualPriceCents! : pkg.monthlyPriceCents
            return (
              <button
                key={pkg.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPlanId(pkg.id)}
                className={cn(
                  'relative flex flex-col gap-4 rounded-2xl border p-5 text-left transition-[border-color,background-color,box-shadow,transform]',
                  on
                    ? 'border-foreground bg-card ring-foreground/[0.07] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)] ring-4'
                    : 'border-input bg-card hover:border-foreground/30 dark:bg-input/30'
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-semibold">
                    {pkg.name}
                  </span>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border transition-colors',
                      on
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-foreground/25'
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={3.5} />}
                  </span>
                </span>
                {pkg.badge && (
                  <span className="bg-lime text-lime-foreground absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                    {pkg.badge}
                  </span>
                )}
                <span className="flex flex-col gap-1">
                  <span className="flex items-baseline gap-1">
                    <span className="font-display text-[28px] leading-none font-semibold tracking-tight">
                      {taka(price)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      /{annual ? 'year' : 'month'}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-[13px]">
                    {annual && pkg.yearlySaving
                      ? `${pkg.yearlySaving} · after the trial`
                      : 'after 7 free days'}
                  </span>
                </span>
                {pkg.tagline && (
                  <span className="text-muted-foreground text-[13px] leading-snug">
                    {pkg.tagline}
                  </span>
                )}
                <ul className="border-border flex flex-col gap-2 border-t pt-4">
                  {pkg.lines.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-[13px] leading-snug"
                    >
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        strokeWidth={3}
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>

        <div className="au-rise-3 mx-auto flex w-full max-w-[640px] flex-col items-center gap-4">
          {error && <FormAlert>{error}</FormAlert>}
          {canStart ? (
            <button
              type="button"
              onClick={startTrial}
              disabled={pending || !chosen}
              className="group bg-primary text-primary-foreground hover:bg-ink-raised dark:hover:bg-primary/85 flex h-13 w-full max-w-[420px] items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-[background-color,transform] active:translate-y-px disabled:opacity-55"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Starting your trial…
                </>
              ) : (
                <>
                  Start my free trial{chosen ? ` on ${chosen.name}` : ''}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          ) : (
            <form
              action={finishOnboardingAction}
              className="w-full max-w-[420px]"
            >
              <input type="hidden" name="next" value="/billing" />
              <PrimaryButton pending={false}>Continue to Billing</PrimaryButton>
            </form>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[13px]">
            {otherPackages.map((pkg) => (
              <span key={pkg.id}>
                {pkg.name} ({taka(pkg.monthlyPriceCents)}/month) has no trial —
                choose it in Billing.
              </span>
            ))}
            <Link
              href="/pricing"
              target="_blank"
              className="hover:text-foreground font-medium underline underline-offset-4"
            >
              Compare every feature
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setStep('business')}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
        </div>
      </div>
    )
  }

  // Ready: the package is on, now the first site.
  const suggested = SUGGESTED_TEMPLATES[category ?? 'other']
  const siteName = encodeURIComponent(name.trim())
  const choices = [
    {
      key: suggested.landing,
      kind: 'LANDING',
      icon: LayoutTemplate,
      title: 'A landing page',
      text: 'One product, with the order form right on the page. Made for Facebook ads.',
    },
    {
      key: suggested.store,
      kind: 'STORE',
      icon: Store,
      title: 'An online store',
      text: 'Your whole catalogue, with a cart, checkout and customer accounts.',
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-10 pt-6 sm:pt-12">
      <header className="au-rise flex flex-col items-center gap-4 text-center">
        <span className="bg-lime text-lime-foreground flex size-14 items-center justify-center rounded-2xl">
          <PartyPopper className="size-6" />
        </span>
        <h1 className="font-display text-[clamp(32px,4.4vw,46px)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance">
          You’re all set{firstName ? `, ${firstName}` : ''}.
        </h1>
        <p className="text-muted-foreground max-w-[520px] text-base text-pretty">
          {started?.endsAt
            ? `${started.planName} is free until ${longDate(started.endsAt)}. `
            : started
              ? `You’re on ${started.planName}. `
              : ''}
          Now make your first site — pick one and we’ll open it with a design
          ready to edit.
        </p>
      </header>

      <div className="au-rise-2 grid gap-4 sm:grid-cols-2">
        {choices.map((choice) => {
          const Icon = choice.icon
          return (
            <Link
              key={choice.kind}
              href={`/stores/new?kind=${choice.kind}&template=${choice.key}${siteName ? `&name=${siteName}` : ''}`}
              className="group bg-card hover:border-foreground/40 flex flex-col overflow-hidden rounded-3xl border transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.45)]"
            >
              <span className="bg-muted relative h-56 overflow-hidden border-b">
                <Image
                  src={`/marketing/templates/${choice.key}.jpg`}
                  alt={`${TEMPLATE_NAMES[choice.key]} template`}
                  fill
                  sizes="(max-width: 640px) 100vw, 420px"
                  className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
                <span className="bg-background/90 text-foreground absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                  {TEMPLATE_NAMES[choice.key]} design
                </span>
              </span>
              <span className="flex flex-col gap-2 p-5">
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span className="font-display text-lg font-semibold">
                    {choice.title}
                  </span>
                </span>
                <span className="text-muted-foreground text-sm">
                  {choice.text}
                </span>
                <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold">
                  Start with {TEMPLATE_NAMES[choice.key]}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          )
        })}
      </div>

      <div className="au-rise-3 flex flex-col items-center gap-3">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <Package className="size-4" />
          Skip for now — take me to my dashboard
        </Link>
      </div>
    </div>
  )
}

function IntervalSwitch({
  value,
  onChange,
  yearlyNote,
}: {
  value: 'MONTHLY' | 'ANNUAL'
  onChange: (value: 'MONTHLY' | 'ANNUAL') => void
  yearlyNote: string | null
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="bg-muted mt-2 inline-flex rounded-xl p-1"
    >
      {(
        [
          ['MONTHLY', 'Monthly'],
          ['ANNUAL', yearlyNote ? `Yearly · ${yearlyNote}` : 'Yearly'],
        ] as const
      ).map(([option, label]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-[background-color,color,box-shadow]',
            value === option
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function PrimaryButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="group bg-primary text-primary-foreground hover:bg-ink-raised dark:hover:bg-primary/85 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-[background-color,transform] active:translate-y-px disabled:opacity-55"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <>
          {children}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  )
}
