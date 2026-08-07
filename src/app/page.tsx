import Link from 'next/link'
import { auth } from '@/server/auth/auth'
import { Button } from '@/components/ui/button'
import { SectionStack } from '@/components/marketing/section-stack'

const SECTION_TYPES = [
  'Navbar',
  'Hero',
  'Text',
  'Image',
  'Image + Text',
  'Features',
  'Services',
  'Cards',
  'Testimonials',
  'Statistics',
  'Pricing',
  'FAQ',
  'Gallery',
  'Video',
  'Call to action',
  'Contact',
  'Newsletter',
  'Footer',
]

export default async function Home() {
  const session = await auth()

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <span className="font-display text-lg font-semibold tracking-tight">
          NCOM
        </span>
        {session?.user ? (
          <Button
            render={<Link href="/dashboard" />}
            nativeButton={false}
            variant="outline"
            size="sm"
          >
            Dashboard
          </Button>
        ) : (
          <Button
            render={<Link href="/login" />}
            nativeButton={false}
            variant="outline"
            size="sm"
          >
            Sign in
          </Button>
        )}
      </header>

      <main className="px-6 sm:px-10">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-16 py-16 sm:py-20 lg:grid-cols-2 lg:gap-8">
          <div className="max-w-xl">
            <span className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
              Landing pages, composed
            </span>
            <h1 className="font-display mt-4 text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              Build pages that look <em className="text-primary">designed</em>.
              <br />
              Not templated.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-md text-lg text-balance">
              Pick a template, drag sections into place, and publish — with a
              result that looks like you hired someone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {session?.user ? (
                <Button
                  render={<Link href="/dashboard" />}
                  nativeButton={false}
                  size="lg"
                >
                  Go to dashboard
                </Button>
              ) : (
                <>
                  <Button
                    render={<Link href="/register" />}
                    nativeButton={false}
                    size="lg"
                  >
                    Get started free
                  </Button>
                  <Button
                    render={<Link href="/login" />}
                    nativeButton={false}
                    size="lg"
                    variant="outline"
                  >
                    Sign in
                  </Button>
                </>
              )}
            </div>
          </div>

          <SectionStack />
        </div>

        <div className="mx-auto w-full max-w-6xl border-t py-16 sm:py-20">
          <span className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
            Every piece, ready to place
          </span>
          <h2 className="font-display mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance">
            Eighteen sections. One page, your way.
          </h2>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {SECTION_TYPES.map((type) => (
              <span
                key={type}
                className="border-border bg-card rounded-full border px-4 py-1.5 text-sm"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="text-muted-foreground border-t px-6 py-8 text-sm sm:px-10">
        © {new Date().getFullYear()} NCOM
      </footer>
    </div>
  )
}
