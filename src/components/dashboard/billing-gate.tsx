'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, Clock, Lock, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * `BillingAccess` (lib/billing-access) as it crosses into the browser: the
 * same answer, with its dates as strings.
 */
export type BillingAccessView =
  | { state: 'OK'; endsAt: string | null; trial: boolean }
  | {
      state: 'GRACE'
      reason: 'TRIAL_ENDED' | 'PAYMENT_DUE'
      dueAt: string
      restrictsAt: string
    }
  | {
      state: 'RESTRICTED'
      reason: 'NO_PLAN' | 'TRIAL_ENDED' | 'PAYMENT_DUE' | 'ENDED'
      dueAt: string | null
    }

/**
 * What a locked workspace can still open: paying (Billing, the invoice print
 * view) and the person's own account and invitations, which are not the
 * workspace's to lock.
 */
const OPEN_WHILE_LOCKED = ['/billing', '/account', '/invitations', '/print']

/** A trial gets a heads-up this many days before it ends. */
const TRIAL_HEADS_UP_DAYS = 3

function isOpen(pathname: string): boolean {
  return OPEN_WHILE_LOCKED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function daysLeft(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  )
}

/**
 * Keeps an unpaid workspace on Billing, and warns before it gets there.
 *
 * The lock is also enforced on the server — every write and every API key is
 * refused (rbac `assertUsable`) and the sites show a holding page — so this is
 * the part a person sees: one clear screen with one way forward, instead of a
 * dashboard full of buttons that all fail.
 */
export function BillingGate({
  access,
  planName,
  isOwner,
  children,
}: {
  access: BillingAccessView
  planName: string
  isOwner: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const onBilling = pathname === '/billing' || pathname.startsWith('/billing/')

  if (access.state === 'RESTRICTED' && !isOpen(pathname)) {
    return <LockScreen access={access} planName={planName} isOwner={isOwner} />
  }

  let banner: React.ReactNode = null
  if (access.state === 'GRACE' && !onBilling) {
    banner = (
      <Banner
        tone="danger"
        icon={<AlertTriangle className="size-4 shrink-0" />}
      >
        {access.reason === 'TRIAL_ENDED'
          ? `Your free trial of ${planName} has ended.`
          : `Your ${planName} bill is due.`}{' '}
        Pay by <strong>{when(access.restrictsAt)}</strong> or your sites go
        offline until it is paid.
        {isOwner && <PayLink />}
      </Banner>
    )
  } else if (
    access.state === 'OK' &&
    access.trial &&
    access.endsAt &&
    daysLeft(access.endsAt) <= TRIAL_HEADS_UP_DAYS &&
    !onBilling
  ) {
    const days = daysLeft(access.endsAt)
    banner = (
      <Banner tone="info" icon={<Clock className="size-4 shrink-0" />}>
        Your free trial of {planName} ends{' '}
        {days <= 1 ? 'within a day' : `in ${days} days`} ({when(access.endsAt)}
        ). Pay now to keep everything running without a break.
        {isOwner && <PayLink />}
      </Banner>
    )
  }

  return (
    <>
      {banner}
      {children}
    </>
  )
}

function PayLink() {
  return (
    <Link
      href="/billing"
      className="ml-1 font-semibold whitespace-nowrap underline underline-offset-2"
    >
      Pay now →
    </Link>
  )
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'danger' | 'info'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-start gap-2 rounded-xl p-3 text-sm',
        tone === 'danger'
          ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
          : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <p>{children}</p>
    </div>
  )
}

const COPY: Record<
  Extract<BillingAccessView, { state: 'RESTRICTED' }>['reason'],
  {
    title: string
    body: (plan: string) => string
    action: string
    href: string
  }
> = {
  NO_PLAN: {
    title: 'Choose a package to get started',
    body: () =>
      'Pick the package that fits your business. Packages with a free trial start straight away — no payment needed.',
    action: 'See packages',
    href: '/billing/plans',
  },
  TRIAL_ENDED: {
    title: 'Your free trial has ended',
    body: (plan) =>
      `Pay for ${plan} to keep going. Until then your sites are offline and the dashboard is paused. Nothing has been deleted — everything comes back the moment the payment goes through.`,
    action: 'Pay now',
    href: '/billing',
  },
  PAYMENT_DUE: {
    title: 'Your workspace is paused',
    body: (plan) =>
      `The bill for ${plan} is unpaid, so your sites are offline and the dashboard is paused. Nothing has been deleted — pay the bill and everything comes back at once.`,
    action: 'Pay now',
    href: '/billing',
  },
  ENDED: {
    title: 'Your plan has ended',
    body: () =>
      'Your sites are offline. Nothing has been deleted — choose a package and everything comes back.',
    action: 'Choose a package',
    href: '/billing/plans',
  },
}

function LockScreen({
  access,
  planName,
  isOwner,
}: {
  access: Extract<BillingAccessView, { state: 'RESTRICTED' }>
  planName: string
  isOwner: boolean
}) {
  const copy = COPY[access.reason]
  const welcome = access.reason === 'NO_PLAN'

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="bg-card border-border w-full max-w-lg rounded-2xl border p-8 text-center shadow-sm">
        <div
          className={cn(
            'mx-auto mb-5 flex size-12 items-center justify-center rounded-full',
            welcome
              ? 'bg-primary/10 text-primary'
              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
          )}
        >
          {welcome ? (
            <Sparkles className="size-5" />
          ) : (
            <Lock className="size-5" />
          )}
        </div>
        <h1 className="font-display text-xl font-semibold">{copy.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {copy.body(planName)}
        </p>
        {isOwner ? (
          <Button
            className="mt-6"
            render={<Link href={copy.href} />}
            nativeButton={false}
          >
            {copy.action}
          </Button>
        ) : (
          <p className="mt-6 text-sm font-medium">
            Ask the workspace owner to{' '}
            {welcome ? 'choose a package' : 'pay the bill'}.
          </p>
        )}
      </div>
    </div>
  )
}
