import Link from 'next/link'
import {
  LayoutTemplate,
  Wand2,
  Rocket,
  Globe2,
  ShieldCheck,
  Gauge,
} from 'lucide-react'
import { auth } from '@/server/auth/auth'
import { Button } from '@/components/ui/button'
import { SectionStack } from '@/components/marketing/section-stack'
import { Navbar } from '@/components/marketing/navbar'
import { Footer } from '@/components/marketing/footer'

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

const FEATURES = [
  {
    icon: Wand2,
    title: 'Visual builder',
    description:
      'Drag sections into place, edit content inline, and watch the canvas update live — no code, no guesswork.',
  },
  {
    icon: LayoutTemplate,
    title: 'Real templates',
    description:
      'Start from a professionally composed layout instead of a blank page. Every template is a real, editable starting point.',
  },
  {
    icon: Rocket,
    title: 'Publish in one click',
    description:
      'Drafts stay private until you publish. Every publish is a versioned snapshot, so rollback is instant.',
  },
  {
    icon: Globe2,
    title: 'Your own subdomain',
    description:
      'Every project ships on its own subdomain automatically, with sitemap and robots handled for you.',
  },
  {
    icon: Gauge,
    title: 'Built for speed',
    description:
      'Published pages render from cached, immutable snapshots — fast for visitors, simple for you.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by default',
    description:
      'Every tenant is isolated at the data layer, with rate limiting and audited admin actions out of the box.',
  },
]

export default async function Home() {
  const session = await auth()

  return (
    <div className="flex flex-1 flex-col">
      <Navbar isSignedIn={!!session?.user} />

      <main>
        {/* Hero */}
        <div className="px-6 sm:px-10">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-16 py-20 sm:py-28 lg:grid-cols-2 lg:gap-8">
            <div className="max-w-xl">
              <span className="border-border bg-accent text-accent-foreground inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide">
                Now building — free while in beta
              </span>
              <h1 className="font-display mt-5 text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
                Build pages that look{' '}
                <span className="text-vivid">designed</span>.
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
        </div>

        {/* Features */}
        <div id="features" className="border-border/60 border-t px-6 sm:px-10">
          <div className="mx-auto w-full max-w-6xl py-20 sm:py-28">
            <div className="max-w-xl">
              <span className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
                Why NCOM
              </span>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Everything a launch needs, nothing it doesn&apos;t.
              </h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title}>
                  <div className="bg-accent text-primary flex size-10 items-center justify-center rounded-xl">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground mt-1.5 text-sm text-balance">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Black stat band */}
        <div className="bg-[#0a0a0a] px-6 py-20 text-white sm:px-10 sm:py-28">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 text-center sm:grid-cols-3">
            <div>
              <p className="text-vivid font-display text-4xl font-semibold sm:text-5xl">
                18
              </p>
              <p className="mt-2 text-sm text-white/60">
                Reusable section types, ready to compose
              </p>
            </div>
            <div>
              <p className="text-vivid font-display text-4xl font-semibold sm:text-5xl">
                1-click
              </p>
              <p className="mt-2 text-sm text-white/60">
                From draft to a live, versioned publish
              </p>
            </div>
            <div>
              <p className="text-vivid font-display text-4xl font-semibold sm:text-5xl">
                0
              </p>
              <p className="mt-2 text-sm text-white/60">
                Lines of code required to launch
              </p>
            </div>
          </div>
        </div>

        {/* Section showcase */}
        <div id="sections" className="border-border/60 border-t px-6 sm:px-10">
          <div className="mx-auto w-full max-w-6xl py-20 sm:py-28">
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
                  className="border-border bg-card hover:border-primary/40 rounded-full border px-4 py-1.5 text-sm transition-colors"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing / final CTA */}
        <div
          id="pricing"
          className="bg-[#0a0a0a] px-6 py-20 text-white sm:px-10 sm:py-28"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Free to start. No credit card.
            </h2>
            <p className="max-w-md text-balance text-white/60">
              Create your workspace, publish your first page, and see what a
              designed page actually feels like.
            </p>
            {session?.user ? (
              <Button
                render={<Link href="/dashboard" />}
                nativeButton={false}
                size="lg"
              >
                Go to dashboard
              </Button>
            ) : (
              <Button
                render={<Link href="/register" />}
                nativeButton={false}
                size="lg"
              >
                Get started free
              </Button>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
