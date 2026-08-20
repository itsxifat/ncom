'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface AppFrameProps {
  /** Logo lockup for the black rail. */
  brand: React.ReactNode
  /** Logo lockup for the light mobile bar. */
  brandOnLight: React.ReactNode
  /** Context that applies to everything below it — which workspace, which mode. */
  railHeader?: React.ReactNode
  nav: React.ReactNode
  /** Pinned to the bottom of the rail — identity, escape hatches. */
  railFooter?: React.ReactNode
  children: React.ReactNode
}

/**
 * Shared geometry for the workspace and the admin panel: a floating black rail
 * and a content column, both inset from the canvas so the page reads as panels
 * laid on a surface rather than regions divided by borders.
 *
 * There is deliberately no top utility bar. Every action worth showing is
 * either global (and belongs in the rail) or specific to the page (and belongs
 * in its header) — a third band only ever repeated one of the two.
 *
 * The content column is deliberately close to uncapped — up to 2400px — so a
 * 27"+ display fills with columns instead of gutter. Grids inside pages add
 * columns at `2xl`/`3xl` to match.
 */
export function AppFrame({
  brand,
  brandOnLight,
  railHeader,
  nav,
  railFooter,
  children,
}: AppFrameProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const [lastPathname, setLastPathname] = useState(pathname)

  // Closes the drawer on navigation. Adjusting state during render (rather
  // than in an effect) is React's own recommended pattern for "reset state
  // when a prop changes" — it avoids an extra committed render with the
  // drawer still open.
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMobileOpen(false)
  }

  // The brand and the workspace switcher are the rail's fixed frame: they name
  // where you are, so they stay put while only the list of destinations moves.
  const railContent = (
    <>
      <div className="flex shrink-0 flex-col gap-6">
        <div className="px-1 pt-1">{brand}</div>
        {railHeader}
      </div>
      <div className="min-h-0 flex-1 scrollbar-none overflow-x-hidden overflow-y-auto">
        {nav}
      </div>
      {railFooter && <div className="shrink-0">{railFooter}</div>}
    </>
  )

  return (
    <div className="bg-canvas flex min-h-svh flex-1 flex-col lg:flex-row lg:items-start lg:gap-4 lg:p-4">
      <div className="bg-canvas/85 sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 backdrop-blur-md lg:hidden">
        {brandOnLight}
        <Button
          variant="outline"
          size="icon"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="bg-sidebar text-sidebar-foreground w-76 overflow-hidden p-4 data-[side=left]:sm:max-w-none"
        >
          <SheetHeader className="sr-only p-0">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full min-h-0 flex-col gap-6">
            {railContent}
          </div>
        </SheetContent>
      </Sheet>

      <aside className="bg-sidebar text-sidebar-foreground sticky top-4 hidden h-[calc(100svh-2rem)] w-60 shrink-0 flex-col gap-6 overflow-hidden rounded-2xl p-4 lg:flex xl:w-68">
        {railContent}
      </aside>

      <main className="w-full min-w-0 flex-1 px-4 pt-6 pb-12 sm:px-6 lg:px-0 lg:pt-0">
        <div className="3xl:max-w-[2100px] 4xl:max-w-[2400px] mx-auto w-full max-w-[1700px]">
          {children}
        </div>
      </main>
    </div>
  )
}
