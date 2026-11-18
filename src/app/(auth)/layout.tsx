import Link from 'next/link'
import { BrandMark } from '@/components/app/brand-mark'
import { AuthShowcase } from '@/components/auth/AuthShowcase'
import { loadPackages } from '@/components/marketing/site/loadPackages'
import { taka, trialPackageNames } from '@/components/marketing/site/packages'
import '@/components/auth/auth.css'

/**
 * Sign in, sign up, email confirmation and password reset: the form on the
 * page's own light or dark ground, and beside it (on wide screens) an ink
 * panel showing what NCOM does for one order. The trial and price lines are
 * read live, so the panel never promises what /admin/plans no longer offers.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const packages = await loadPackages()
  const trials = trialPackageNames(packages)
  const paid = packages.filter((p) => p.monthlyPriceCents > 0)
  const from = paid.length
    ? taka(Math.min(...paid.map((p) => p.monthlyPriceCents)))
    : null
  const facts = [
    trials ? '7-day free trial' : null,
    'No payment to start',
    from ? `From ${from} a month` : null,
    'No cut of your sales',
  ].filter((fact): fact is string => Boolean(fact))

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-1">
      <div className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-10 sm:py-8">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="NCOM home" className="w-fit">
            <BrandMark tone="onLight" />
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <footer className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <span>© NCOM</span>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Help
          </Link>
        </footer>
      </div>

      <div className="hidden w-[min(46%,720px)] shrink-0 lg:block">
        <AuthShowcase facts={facts} />
      </div>
    </div>
  )
}
