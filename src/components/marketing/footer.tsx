import Link from 'next/link'

import { BrandMark } from '@/components/app/brand-mark'

const FOOTER_LINKS: {
  title: string
  links: { label: string; href: string }[]
}[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Sections', href: '/#sections' },
      { label: 'Pricing', href: '/#pricing' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'API documentation', href: '/docs' },
      { label: 'Import your catalogue', href: '/docs#import' },
      { label: 'Webhooks', href: '/docs#webhooks' },
      { label: 'Stock sync', href: '/docs#stock-sync' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Create account', href: '/register' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Contact', href: '#' },
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-border/60 bg-ink border-t text-white">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" aria-label="NCOM home">
              <BrandMark tone="onDark" size="lg" />
            </Link>
            <p className="mt-4 max-w-40 text-sm text-white/50">
              Landing pages that look designed, not templated.
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold tracking-[0.1em] text-white/40 uppercase">
                {group.title}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-white/40 sm:flex-row">
          <p>© {new Date().getFullYear()} NCOM. All rights reserved.</p>
          <p>Built for teams who ship fast.</p>
        </div>
      </div>
    </footer>
  )
}
