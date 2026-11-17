import type { Metadata } from 'next'
import Link from 'next/link'
import { PackageCards } from '@/components/marketing/site/PackageCards'
import { ComparisonTable } from '@/components/marketing/site/ComparisonTable'
import { QuestionList } from '@/components/marketing/site/QuestionList'
import { CONTAINER, SectionIntro } from '@/components/marketing/site/ui'
import { FinalCta } from '@/components/marketing/site/home/FinalCta'
import { loadPackages } from '@/components/marketing/site/loadPackages'
import { taka, trialPackageNames } from '@/components/marketing/site/packages'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'NCOM packages from ৳199 a month: landing pages and online stores for sellers in Bangladesh, with a 7-day free trial and no cut of your sales.',
  alternates: { canonical: '/pricing' },
}

const LINK = {
  color: 'var(--accent-text)',
  fontWeight: 700,
  textDecoration: 'none',
} as const

export default async function PricingPage() {
  const packages = await loadPackages()
  const from = Math.min(
    ...packages
      .filter((p) => p.monthlyPriceCents > 0)
      .map((p) => p.monthlyPriceCents)
  )
  const trials = trialPackageNames(packages)

  return (
    <>
      <section
        style={{
          ...CONTAINER,
          padding: 'clamp(64px, 8vw, 104px) clamp(16px, 4vw, 40px) 0',
        }}
      >
        <SectionIntro
          as="h1"
          eyebrow="Pricing"
          title={`Packages from ${Number.isFinite(from) ? taka(from) : '৳199'}. No cut of your sales.`}
          lead={
            <>
              Pick a package, try it free for 7 days with no payment, then pay
              monthly or yearly in taka. Every package takes cash-on-delivery
              orders, books Steadfast and Pathao, and checks each buyer’s
              delivery record.
            </>
          }
        />
      </section>

      <section
        style={{ ...CONTAINER, marginTop: '48px' }}
        aria-label="Packages"
      >
        <PackageCards packages={packages} showToggle />
      </section>

      <section
        aria-labelledby="compare-title"
        style={{
          ...CONTAINER,
          padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px) 0',
        }}
      >
        <SectionIntro
          id="compare-title"
          eyebrow="Compare"
          title="Every package, side by side."
          lead="All limits are per workspace. Need a little more of one thing? Add an extra domain, seat, storage or traffic to any package from your dashboard."
        />
        <div style={{ marginTop: '48px' }}>
          <ComparisonTable packages={packages} />
        </div>
      </section>

      <section
        aria-labelledby="billing-faq"
        style={{
          ...CONTAINER,
          maxWidth: '920px',
          padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px)',
        }}
      >
        <SectionIntro
          id="billing-faq"
          eyebrow="Billing"
          title="How paying for NCOM works"
        />
        <div style={{ marginTop: '40px' }}>
          <QuestionList
            items={[
              {
                q: 'How does the free trial work?',
                a: `${trials || 'Packages with a trial'} start with 7 days free — no payment and no card. You can switch to another package during the trial; it keeps its end date. One trial per workspace.`,
              },
              {
                q: 'What happens when the trial ends?',
                a: 'Your first bill is ready a few days before. Pay it and everything carries on. If it isn’t paid within a day of the trial ending, your workspace pauses: your sites show “temporarily unavailable” and the dashboard opens on Billing only. Nothing is deleted, and paying brings everything back immediately.',
              },
              {
                q: 'How do I pay?',
                a: 'Online with bKash, Nagad, Rocket or a card, through Enfinito Pay. You get a VAT invoice for every payment.',
              },
              {
                q: 'Monthly or yearly?',
                a: 'Either. A year costs eleven months — one month free. Pay your next bill early and the new period starts where the current one ends, so you never lose days.',
              },
              {
                q: 'Can I change or cancel my package?',
                a: 'Yes, from Plan & billing, at any time. A cancelled package runs to the end of the period you paid for.',
              },
              {
                q: 'Do you take a commission on orders?',
                a: 'No. You pay for your package, and nothing per order — however many you get.',
              },
              {
                q: 'Can I get a refund?',
                a: (
                  <>
                    See our{' '}
                    <Link href="/refund-policy" style={LINK}>
                      refund policy
                    </Link>
                    . The free trial is there so you can be sure before you pay.
                  </>
                ),
              },
            ]}
          />
        </div>
      </section>

      <FinalCta />
    </>
  )
}
