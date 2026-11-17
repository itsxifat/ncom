import Link from 'next/link'
import { PackageCards } from '../PackageCards'
import { SectionIntro } from '../ui'
import { taka, trialPackageNames, type PublicPackage } from '../packages'

/**
 * The homepage's pricing, as designed — with the packages read live, so a
 * price changed in /admin/plans is the price shown here.
 */
export function PricingSection({ packages }: { packages: PublicPackage[] }) {
  const from = Math.min(
    ...packages
      .filter((p) => p.monthlyPriceCents > 0)
      .map((p) => p.monthlyPriceCents)
  )
  const trials = trialPackageNames(packages)

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px)',
        boxSizing: 'border-box',
      }}
    >
      <SectionIntro
        id="pricing-title"
        eyebrow="Pricing"
        title={`Packages from ${Number.isFinite(from) ? taka(from) : '৳199'}, with no cut of your sales.`}
        lead={
          <>
            Every package includes the order form, offers, courier booking, the
            fake-order check, stickers, tracking, the API and Use your own AI.
            {trials && ` ${trials} start with 7 days free — no payment needed.`}
          </>
        }
      />
      <div style={{ marginTop: '56px' }}>
        <PackageCards packages={packages} />
      </div>
      <p
        style={{
          margin: '28px 0 0',
          textAlign: 'center',
          fontSize: '14px',
          color: 'var(--s-subtle)',
        }}
      >
        Pay monthly or yearly in taka, with bKash, Nagad, Rocket or a card · No
        per-order fee · Build with AI uses credits on any package ·{' '}
        <Link
          href="/pricing"
          data-hover="link"
          style={{
            color: 'var(--accent-text)',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Compare every package →
        </Link>
      </p>
    </section>
  )
}
