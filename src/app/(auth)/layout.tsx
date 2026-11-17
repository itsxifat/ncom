import Link from 'next/link'
import { BrandMark } from '@/components/app/brand-mark'
import { loadPackages } from '@/components/marketing/site/loadPackages'
import { taka, trialPackageNames } from '@/components/marketing/site/packages'

/**
 * Sign in, sign up and email verification — in the public site's look (dark
 * ink and lime), so arriving from the homepage does not feel like leaving it.
 * The form side runs on the app's dark theme, whose primary is the brand lime.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Read live, so the panel never promises a trial or a price the packages
  // in /admin/plans no longer have.
  const packages = await loadPackages()
  const trials = trialPackageNames(packages)
  const paid = packages.filter((p) => p.monthlyPriceCents > 0)
  const from = paid.length
    ? taka(Math.min(...paid.map((p) => p.monthlyPriceCents)))
    : null
  const points = [
    trials
      ? `${trials} start with 7 days free — no payment needed.`
      : 'Choose a package and start selling the same day.',
    'Cash-on-delivery orders in Bangla or English, on a page or a full store.',
    'Steadfast and Pathao booking, with each buyer’s delivery record checked.',
  ]

  return (
    <div className="dark flex flex-1 bg-[#09090b] text-[#f5f5f6]">
      <div className="flex flex-1 flex-col px-4 py-8 sm:px-8">
        <Link href="/" aria-label="NCOM home" className="w-fit">
          <BrandMark tone="onDark" />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-[#a1a1aa]">
          <Link href="/terms" className="hover:text-[#f5f5f6]">
            Terms
          </Link>
          {' · '}
          <Link href="/privacy" className="hover:text-[#f5f5f6]">
            Privacy
          </Link>
          {' · '}
          <Link href="/pricing" className="hover:text-[#f5f5f6]">
            Pricing
          </Link>
        </p>
      </div>

      <aside
        aria-label="Why NCOM"
        className="relative hidden w-[44%] max-w-[640px] flex-col justify-between overflow-hidden bg-[#d8f84e] p-12 text-[#0b0b0c] lg:flex"
      >
        <p className="text-sm font-bold">For Facebook sellers in Bangladesh</p>
        <div>
          <h2 className="font-display text-[clamp(40px,4vw,60px)] leading-[0.98] font-semibold tracking-[-0.035em] text-balance">
            Make a landing page or an online store in minutes.
          </h2>
          <ul className="mt-10 flex flex-col gap-4 text-base font-medium">
            {points.map((point) => (
              <li key={point} className="flex gap-3">
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm font-semibold opacity-70">
          No per-order fee{from ? ` · Packages from ${from} a month` : ''}
        </p>
      </aside>
    </div>
  )
}
