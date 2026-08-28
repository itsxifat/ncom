'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * Light/dark for the workspace.
 *
 * NCOM used to be a dark-only product: `dark` was hard-coded onto <html> and the
 * light palette in `:root` was never rendered. It is rendered now, and it is the
 * default — the workspace is a light surface with a black rail, and dark mode is
 * a preference rather than the identity.
 *
 * `attribute="class"` because the token blocks in globals.css are keyed on
 * `.dark`, which is also what Tailwind's `dark:` variant matches. next-themes
 * writes that class from an inline script in <head>, so the class is on the
 * element before first paint and there is no flash of the wrong theme — the
 * approach the Next.js "preventing flash before hydration" guide describes,
 * without hand-rolling the script.
 *
 * `disableTransitionOnChange` suppresses every CSS transition for the tick in
 * which the class flips. Without it, each element's own `transition-colors`
 * animates independently and the page appears to dissolve one component at a
 * time instead of switching.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
