'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/app/brand-mark'
import { cn } from '@/lib/utils'

// Anchors point at sections of the home page, so they carry the leading `/`
// to stay correct from /docs — a bare `#pricing` on another route scrolls
// nowhere and leaves the visitor on a page with no way back.
const NAV_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#sections', label: 'Sections' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/docs', label: 'Developers' },
]

export function Navbar({ isSignedIn }: { isSignedIn: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-10">
        <Link href="/" aria-label="NCOM home">
          <BrandMark tone="onLight" size="lg" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isSignedIn ? (
            <Button render={<Link href="/dashboard" />} nativeButton={false}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                render={<Link href="/login" />}
                nativeButton={false}
                variant="ghost"
              >
                Sign in
              </Button>
              <Button render={<Link href="/register" />} nativeButton={false}>
                Get started free
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="text-foreground -mr-2 flex size-10 items-center justify-center md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <div
        className={cn(
          'overflow-hidden transition-[max-height] duration-300 ease-in-out md:hidden',
          open ? 'max-h-96' : 'max-h-0'
        )}
      >
        <nav className="border-border/60 flex flex-col gap-1 border-t px-6 py-4 sm:px-10">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-foreground rounded-lg px-2 py-2.5 text-sm font-medium"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            {isSignedIn ? (
              <Button render={<Link href="/dashboard" />} nativeButton={false}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button render={<Link href="/register" />} nativeButton={false}>
                  Get started free
                </Button>
                <Button
                  render={<Link href="/login" />}
                  nativeButton={false}
                  variant="outline"
                >
                  Sign in
                </Button>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
