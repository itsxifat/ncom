import Link from 'next/link'
import { BrandMark } from '@/components/app/brand-mark'
import { signOutAction } from '@/app/(dashboard)/actions'
import '@/components/auth/auth.css'

/**
 * Onboarding has its own frame: no dashboard rail to wander off into, just
 * the logo, the step in hand and a way out.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" aria-label="NCOM home" className="w-fit">
          <BrandMark tone="onLight" />
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-muted-foreground hover:text-foreground rounded-lg px-2 py-1 text-sm font-medium transition-colors"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col px-5 pb-16 sm:px-8">
        {children}
      </main>
    </div>
  )
}
