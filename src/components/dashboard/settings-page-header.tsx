'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { SETTINGS_GROUPS } from '@/components/dashboard/settings-entries'

/**
 * Settings screens that draw their own header — with actions or live status
 * the shared one cannot know about — and only need the way back from here.
 */
const OWN_HEADER = new Set([
  '/settings/api-keys',
  '/settings/courier',
  '/settings/order-destination',
  '/settings/product-source',
  '/settings/webhooks',
])

/**
 * The top of every settings screen: a way back to the list, and for screens
 * that are only a form, the title and description the list already gave them.
 *
 * Several of these screens were written as bare forms that a parent page
 * framed, and lost their heading when they became pages of their own — a
 * merchant arriving at "Payments" from a link landed on a list of provider
 * cards with nothing saying what screen it was. Reading the title from the
 * same list the Settings page renders means the two can never disagree.
 */
export function SettingsPageHeader() {
  const pathname = usePathname()
  if (pathname === '/settings') return null

  const entry = SETTINGS_GROUPS.flatMap((group) => group.entries).find(
    (candidate) => candidate.href === pathname
  )

  const back = (
    <Link
      href="/settings"
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm font-medium transition-colors"
    >
      <ArrowLeft className="size-4" />
      Settings
    </Link>
  )

  if (!entry || OWN_HEADER.has(pathname)) return back

  return (
    <div className="flex flex-col gap-4">
      {back}
      <PageHeader title={entry.title} description={entry.description} />
    </div>
  )
}
