'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MobileTabBar, type TabItem } from '@/components/app/mobile-tab-bar'

interface AppFrameProps {
  /** Logo lockup at the top of the rail. */
  brand: React.ReactNode
  /** Context that applies to everything below it — which workspace, which mode. */
  railHeader?: React.ReactNode
  nav: React.ReactNode
  /** Pinned to the bottom of the rail — identity, settings, escape hatches. */
  railFooter?: React.ReactNode
  /**
   * The four destinations worth a permanent thumb-tap on a phone. The bar is
   * hidden entirely when this is empty, for shells that have nowhere to go.
   */
  tabs?: TabItem[]
  /** Compact controls for the mobile top bar — the ones that say *where* you are. */
  mobileActions?: React.ReactNode
  children: React.ReactNode
}

/**
 * Shared geometry for the workspace and the admin panel: a white rail down the
 * left edge, divided from the content by a hairline, and a content column that
 * scrolls with the page.
 *
 * The rail used to be a black panel floating on the canvas. It looked good and
 * it worked against the people using it: the darkest, highest-contrast thing on
 * every screen was the one part that never changes, so the eye kept landing on
 * the navigation instead of the orders. Now the rail is one more surface, and
 * the only colour in it is the lime marker on where you are.
 *
 * There is deliberately no top utility bar on desktop. Every action worth
 * showing is either global (and belongs in the rail) or specific to the page
 * (and belongs in its header) — a third band only ever repeated one of the two.
 *
 * On a phone the same navigation is a bar along the bottom edge rather than a
 * drawer behind a hamburger; see `MobileTabBar` for why. The drawer still
 * exists and still holds the complete list, but it is the fifth tab rather than
 * the only way in.
 *
 * The content column is deliberately close to uncapped — up to 2400px — so a
 * 27"+ display fills with columns instead of gutter. Pages that are a readable
 * column rather than a table cap themselves; see `PageShell`.
 */
export function AppFrame({
  brand,
  railHeader,
  nav,
  railFooter,
  tabs,
  mobileActions,
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
  // The footer is fixed too, so identity and Settings never scroll out of view
  // under a long nav.
  const railContent = (
    <>
      <div className="flex shrink-0 flex-col gap-5">
        <div className="px-2 pt-1">{brand}</div>
        {railHeader}
      </div>
      <div className="overscroll-none-y min-h-0 flex-1 scrollbar-none overflow-x-hidden overflow-y-auto">
        {nav}
      </div>
      {railFooter && (
        <div className="flex shrink-0 flex-col gap-1">{railFooter}</div>
      )}
    </>
  )

  return (
    <div className="bg-canvas flex min-h-svh flex-1 flex-col lg:flex-row lg:items-start">
      {/* The mobile top bar carries identity and context only — every actual
          destination is in the tab bar at the bottom, within reach. */}
      <div className="bg-canvas/85 border-border sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur-md lg:hidden">
        {brand}
        {mobileActions}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="bg-sidebar text-sidebar-foreground w-76 overflow-hidden p-4 data-[side=left]:sm:max-w-none"
        >
          <SheetHeader className="sr-only p-0">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full min-h-0 flex-col gap-5">
            {railContent}
          </div>
        </SheetContent>
      </Sheet>

      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-5 overflow-hidden border-r px-3.5 pt-5 pb-3.5 lg:flex xl:w-68">
        {railContent}
      </aside>

      {/* `pb-tabbar` clears the floating bar so the last row of a list is
          reachable; the cap lifts at `lg`, where the bar is gone. */}
      <main className="pb-tabbar w-full min-w-0 flex-1 px-4 pt-5 sm:px-6 lg:px-10 lg:pt-9 lg:pb-14">
        <div className="3xl:max-w-[2100px] 4xl:max-w-[2400px] mx-auto w-full max-w-[1700px]">
          {children}
        </div>
      </main>

      {tabs && tabs.length > 0 && (
        <MobileTabBar
          items={tabs}
          onMore={() => setMobileOpen(true)}
          moreActive={mobileOpen}
        />
      )}

      {/* A shell with nowhere to tab to still needs a way into the drawer. */}
      {(!tabs || tabs.length === 0) && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 lg:hidden">
          <Button
            variant="default"
            className="shadow-lift"
            onClick={() => setMobileOpen(true)}
          >
            Menu
          </Button>
        </div>
      )}
    </div>
  )
}
