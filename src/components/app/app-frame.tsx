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
import { ThemeToggle } from '@/components/app/theme-toggle'
import { MobileTabBar, type TabItem } from '@/components/app/mobile-tab-bar'

interface AppFrameProps {
  /** Logo lockup for the black rail. */
  brand: React.ReactNode
  /** Context that applies to everything below it — which workspace, which mode. */
  railHeader?: React.ReactNode
  nav: React.ReactNode
  /** Pinned to the bottom of the rail — identity, escape hatches. */
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
 * Shared geometry for the workspace and the admin panel: a floating black rail
 * and a content column, both inset from the canvas so the page reads as panels
 * laid on a surface rather than regions divided by borders.
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
 * 27"+ display fills with columns instead of gutter. Grids inside pages add
 * columns at `2xl`/`3xl` to match.
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
  // The theme switch sits with the footer rather than in the scrolling middle,
  // because it is a setting rather than a destination and should not drift out
  // of view under a long nav.
  const railContent = (
    <>
      <div className="flex shrink-0 flex-col gap-6">
        <div className="px-1 pt-1">{brand}</div>
        {railHeader}
      </div>
      <div className="overscroll-none-y min-h-0 flex-1 scrollbar-none overflow-x-hidden overflow-y-auto">
        {nav}
      </div>
      <div className="flex shrink-0 flex-col gap-2.5">
        <ThemeToggle />
        {railFooter}
      </div>
    </>
  )

  return (
    <div className="bg-canvas flex min-h-svh flex-1 flex-col lg:flex-row lg:items-start lg:gap-4 lg:p-4">
      {/* The mobile top bar carries identity and context only — every actual
          destination is in the tab bar at the bottom, within reach. */}
      <div className="bg-canvas/85 border-border sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur-md lg:hidden">
        {/* The rail's own black is the mark's designed ground, and it is the
            one surface guaranteed not to move under a theme change, so the
            lockup travels with a scrap of it rather than being recoloured. */}
        <span className="bg-sidebar dark flex items-center rounded-full px-3 py-1.5">
          {brand}
        </span>
        {mobileActions}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        {/* `dark` for the same reason the rail carries it: the drawer *is* the
            rail on a phone, so everything inside it resolves ink tokens no
            matter what the page behind is doing. */}
        <SheetContent
          side="left"
          className="dark bg-sidebar text-sidebar-foreground w-76 overflow-hidden p-4 data-[side=left]:sm:max-w-none"
        >
          <SheetHeader className="sr-only p-0">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full min-h-0 flex-col gap-6">
            {railContent}
          </div>
        </SheetContent>
      </Sheet>

      {/*
       * `dark` is not a theme choice here, it is what keeps the rail black in
       * both themes. The token block it selects is the ink one, so every
       * control inside the rail — buttons, the workspace menu's trigger, the
       * theme switch — resolves colours that are correct on black, rather than
       * inheriting a light page's palette and rendering pale-on-pale.
       */}
      <aside className="dark bg-sidebar text-sidebar-foreground sticky top-4 hidden h-[calc(100svh-2rem)] w-60 shrink-0 flex-col gap-6 overflow-hidden rounded-2xl p-4 lg:flex xl:w-68">
        {railContent}
      </aside>

      {/* `pb-tabbar` clears the floating bar so the last row of a list is
          reachable; the cap lifts at `lg`, where the bar is gone. */}
      <main className="pb-tabbar w-full min-w-0 flex-1 px-4 pt-5 sm:px-6 lg:px-0 lg:pt-0 lg:pb-12">
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
